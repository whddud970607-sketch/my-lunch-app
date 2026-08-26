import { Controller, Get, Req, UseGuards } from "@nestjs/common";
import type { SupabaseClient } from "@supabase/supabase-js";
import { AuthGuard } from "../auth/auth.guard";
import { CurrentUser } from "../auth/current-user.decorator";
import type { AuthUser } from "../auth/auth.types";
import { ProfilesService } from "../profiles/profiles.service";

@Controller("me")
@UseGuards(AuthGuard)
export class MeController {
  constructor(private readonly profiles: ProfilesService) {}

  @Get()
  async me(
    @CurrentUser() user: AuthUser,
    @Req() req: { supabaseUser: SupabaseClient },
  ) {
    return this.profiles.getMePayload(req.supabaseUser, user);
  }
}
