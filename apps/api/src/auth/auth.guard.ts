import {
  CanActivate,
  ExecutionContext,
  Inject,
  Injectable,
  UnauthorizedException,
} from "@nestjs/common";
import { AUTH_VERIFIER, type AuthVerifier } from "./auth-verifier";
import { SupabaseUserClientFactory } from "../supabase/supabase-user.client";
import { ProfilesService } from "../profiles/profiles.service";
import type { AuthUser, DriverRow, ProfileRow } from "./auth.types";
import { MePerfTiming } from "../me/me-perf-timing";

@Injectable()
export class AuthGuard implements CanActivate {
  constructor(
    @Inject(AUTH_VERIFIER) private readonly jwt: AuthVerifier,
    private readonly userClients: SupabaseUserClientFactory,
    private readonly profiles: ProfilesService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const req = context.switchToHttp().getRequest<{
      headers: { authorization?: string };
      authUser?: AuthUser;
      authProfile?: ProfileRow;
      authDriver?: DriverRow | null;
      supabaseUser?: ReturnType<SupabaseUserClientFactory["createForAccessToken"]>;
      mePerf?: MePerfTiming;
    }>();

    const isMe = context.getClass().name === "MeController";
    const perf = isMe ? new MePerfTiming() : undefined;
    if (perf) {
      req.mePerf = perf;
      perf.mark("ME_SERVER_START");
      perf.mark("ME_AUTH_GUARD_START");
    }

    const header = req.headers.authorization;
    if (!header?.startsWith("Bearer ")) {
      throw new UnauthorizedException("Missing Bearer token");
    }

    const accessToken = header.slice("Bearer ".length).trim();
    if (!accessToken) {
      throw new UnauthorizedException("Empty Bearer token");
    }

    let verified;
    try {
      verified = await this.jwt.verifyAccessToken(accessToken);
    } catch {
      throw new UnauthorizedException("Invalid or expired token");
    }
    if (perf) perf.mark("ME_JWT_VERIFY_DONE");

    const supabaseUser = this.userClients.createForAccessToken(accessToken);
    const resolved = await this.profiles.resolveAuthUser(
      supabaseUser,
      verified.userId,
      accessToken,
      verified.email,
      perf,
    );

    req.authUser = resolved.user;
    req.authProfile = resolved.profile;
    req.authDriver = resolved.driver;
    req.supabaseUser = supabaseUser;

    if (perf) perf.mark("ME_AUTH_GUARD_END");
    return true;
  }
}
