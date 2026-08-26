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
import type { AuthUser } from "./auth.types";

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
      supabaseUser?: ReturnType<SupabaseUserClientFactory["createForAccessToken"]>;
    }>();

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

    const supabaseUser = this.userClients.createForAccessToken(accessToken);
    const authUser = await this.profiles.resolveAuthUser(
      supabaseUser,
      verified.userId,
      accessToken,
      verified.email,
    );

    req.authUser = authUser;
    req.supabaseUser = supabaseUser;
    return true;
  }
}
