import { Module } from "@nestjs/common";
import { AUTH_VERIFIER } from "./auth-verifier";
import { SupabaseJwtService } from "./supabase-jwt.service";
import { AuthGuard } from "./auth.guard";
import { RolesGuard } from "./roles.guard";
import { ProfilesModule } from "../profiles/profiles.module";

@Module({
  imports: [ProfilesModule],
  providers: [
    SupabaseJwtService,
    { provide: AUTH_VERIFIER, useExisting: SupabaseJwtService },
    AuthGuard,
    RolesGuard,
  ],
  exports: [
    SupabaseJwtService,
    AUTH_VERIFIER,
    AuthGuard,
    RolesGuard,
    ProfilesModule,
  ],
})
export class AuthModule {}
