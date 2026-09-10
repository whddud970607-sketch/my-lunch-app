import {
  Injectable,
  Logger,
  ServiceUnavailableException,
  UnauthorizedException,
} from "@nestjs/common";
import type { SupabaseClient } from "@supabase/supabase-js";
import { SupabaseServiceClient } from "../supabase/supabase-service.client";
import type {
  AuthUser,
  DriverRow,
  ProfileRow,
  UserRole,
} from "../auth/auth.types";
import type { MePerfTiming } from "../me/me-perf-timing";

/** AuthGuard resolution: AuthUser plus rows needed for GET /me (no re-fetch). */
export type ResolvedAuthContext = {
  user: AuthUser;
  profile: ProfileRow;
  driver: DriverRow | null;
};

export type MePayload = {
  userId: string;
  email: string | null;
  role: UserRole;
  companyId: string | null;
  displayName: string | null;
  driver: {
    id: string;
    companyId: string | null;
    workStatus: string;
  } | null;
};

@Injectable()
export class ProfilesService {
  private readonly logger = new Logger(ProfilesService.name);

  constructor(private readonly serviceClient: SupabaseServiceClient) {}

  async resolveAuthUser(
    userClient: SupabaseClient,
    userId: string,
    accessToken: string,
    email?: string,
    perf?: MePerfTiming,
  ): Promise<ResolvedAuthContext> {
    let { profile, driver } = await this.fetchProfileAndDriver(
      userClient,
      userId,
      perf,
    );

    if (!profile || !driver) {
      perf?.mark("ME_BOOTSTRAP_START");
      await this.bootstrapIfMissing(userId, email);
      perf?.mark("ME_BOOTSTRAP_END");
      ({ profile, driver } = await this.fetchProfileAndDriver(
        userClient,
        userId,
        perf,
      ));
    }

    if (!profile) {
      throw new UnauthorizedException("Profile not provisioned");
    }

    return {
      user: {
        userId,
        email,
        role: profile.role,
        companyId: profile.company_id,
        driverId: driver?.id ?? null,
        accessToken,
      },
      profile,
      driver,
    };
  }

  /**
   * Build GET /me body from AuthGuard-resolved rows — no additional DB reads.
   */
  buildMePayload(
    user: AuthUser,
    profile: ProfileRow,
    driver: DriverRow | null,
    perf?: MePerfTiming,
  ): MePayload {
    perf?.mark("ME_PAYLOAD_BUILD_START");
    if (!profile) {
      throw new UnauthorizedException("Profile not found");
    }
    const payload: MePayload = {
      userId: user.userId,
      email: user.email ?? null,
      role: profile.role,
      companyId: profile.company_id,
      displayName: profile.display_name,
      driver: driver
        ? {
            id: driver.id,
            companyId: driver.company_id,
            workStatus: driver.work_status,
          }
        : null,
    };
    perf?.mark("ME_PAYLOAD_BUILD_END");
    return payload;
  }

  private async fetchProfileAndDriver(
    userClient: SupabaseClient,
    userId: string,
    perf?: MePerfTiming,
  ): Promise<{ profile: ProfileRow | null; driver: DriverRow | null }> {
    // Independent lookups on userId — safe to parallelize.
    perf?.mark("ME_PROFILE_QUERY_START");
    perf?.mark("ME_DRIVER_QUERY_START");
    const [profile, driver] = await Promise.all([
      this.fetchProfile(userClient, userId),
      this.fetchDriver(userClient, userId),
    ]);
    perf?.mark("ME_PROFILE_QUERY_END");
    perf?.mark("ME_DRIVER_QUERY_END");
    return { profile, driver };
  }

  private async fetchProfile(
    client: SupabaseClient,
    userId: string,
  ): Promise<ProfileRow | null> {
    const { data, error } = await client
      .from("profiles")
      .select("id, role, company_id, display_name")
      .eq("id", userId)
      .maybeSingle();

    if (error) {
      this.logger.warn(`profiles select failed code=${error.code}`);
      return null;
    }
    if (!data) return null;
    return data as ProfileRow;
  }

  private async fetchDriver(
    client: SupabaseClient,
    userId: string,
  ): Promise<DriverRow | null> {
    const { data, error } = await client
      .from("drivers")
      .select("id, user_id, company_id, work_status")
      .eq("user_id", userId)
      .maybeSingle();

    if (error) {
      this.logger.warn(`drivers select failed code=${error.code}`);
      return null;
    }
    if (!data) return null;
    return data as DriverRow;
  }

  /**
   * Rare recovery if auth.users trigger has not created rows yet.
   * Uses service_role only here — never for routine reads.
   * Always inserts role=driver (cannot create platform_admin).
   */
  private async bootstrapIfMissing(userId: string, email?: string) {
    const admin = this.serviceClient.getOrNull();
    if (!admin) {
      throw new ServiceUnavailableException(
        "Profile bootstrap unavailable (service role not configured)",
      );
    }

    const displayName = email?.split("@")[0] ?? null;

    const { error: profileError } = await admin.from("profiles").upsert(
      {
        id: userId,
        role: "driver" satisfies UserRole,
        display_name: displayName,
      },
      { onConflict: "id", ignoreDuplicates: true },
    );

    if (profileError) {
      this.logger.warn(`bootstrap profile failed code=${profileError.code}`);
    }

    const { data: existingDriver } = await admin
      .from("drivers")
      .select("id")
      .eq("user_id", userId)
      .maybeSingle();

    if (!existingDriver) {
      const { error: driverError } = await admin.from("drivers").insert({
        user_id: userId,
      });
      if (driverError) {
        this.logger.warn(`bootstrap driver failed code=${driverError.code}`);
      }
    }
  }
}
