import {
  Injectable,
  Logger,
  ServiceUnavailableException,
  UnauthorizedException,
} from "@nestjs/common";
import type { SupabaseClient } from "@supabase/supabase-js";
import { SupabaseServiceClient } from "../supabase/supabase-service.client";
import type { AuthUser, DriverRow, ProfileRow, UserRole } from "../auth/auth.types";

@Injectable()
export class ProfilesService {
  private readonly logger = new Logger(ProfilesService.name);

  constructor(private readonly serviceClient: SupabaseServiceClient) {}

  async resolveAuthUser(
    userClient: SupabaseClient,
    userId: string,
    accessToken: string,
    email?: string,
  ): Promise<AuthUser> {
    let profile = await this.fetchProfile(userClient, userId);
    let driver = await this.fetchDriver(userClient, userId);

    if (!profile || !driver) {
      await this.bootstrapIfMissing(userId, email);
      profile = await this.fetchProfile(userClient, userId);
      driver = await this.fetchDriver(userClient, userId);
    }

    if (!profile) {
      throw new UnauthorizedException("Profile not provisioned");
    }

    return {
      userId,
      email,
      role: profile.role,
      companyId: profile.company_id,
      driverId: driver?.id ?? null,
      accessToken,
    };
  }

  async getMePayload(userClient: SupabaseClient, user: AuthUser) {
    const profile = await this.fetchProfile(userClient, user.userId);
    if (!profile) {
      throw new UnauthorizedException("Profile not found");
    }
    const driver = await this.fetchDriver(userClient, user.userId);

    return {
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
