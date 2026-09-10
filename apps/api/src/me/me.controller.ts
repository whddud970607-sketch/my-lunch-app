import { Controller, Get, Req, UnauthorizedException, UseGuards } from "@nestjs/common";
import type { SupabaseClient } from "@supabase/supabase-js";
import { AuthGuard } from "../auth/auth.guard";
import { CurrentUser } from "../auth/current-user.decorator";
import type { AuthUser, DriverRow, ProfileRow } from "../auth/auth.types";
import { ProfilesService } from "../profiles/profiles.service";
import type { MePerfTiming } from "./me-perf-timing";

@Controller("me")
@UseGuards(AuthGuard)
export class MeController {
  constructor(private readonly profiles: ProfilesService) {}

  @Get()
  me(
    @CurrentUser() user: AuthUser,
    @Req()
    req: {
      supabaseUser: SupabaseClient;
      authProfile?: ProfileRow;
      authDriver?: DriverRow | null;
      mePerf?: MePerfTiming;
    },
  ) {
    const perf = req.mePerf;
    try {
      const profile = req.authProfile;
      if (!profile) {
        throw new UnauthorizedException("Profile not provisioned");
      }
      // PERF-S3B: reuse AuthGuard rows — no second profiles/drivers select.
      const payload = this.profiles.buildMePayload(
        user,
        profile,
        req.authDriver ?? null,
        perf,
      );
      perf?.end(200);
      return payload;
    } catch (e) {
      perf?.end(500);
      throw e;
    }
  }
}
