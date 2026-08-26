import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
} from "@nestjs/common";
import { Reflector } from "@nestjs/core";
import { ROLES_KEY } from "./roles.decorator";
import type { AuthUser, UserRole } from "./auth.types";

@Injectable()
export class RolesGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const required = this.reflector.getAllAndOverride<UserRole[]>(ROLES_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (!required || required.length === 0) {
      return true;
    }

    const req = context.switchToHttp().getRequest<{ authUser?: AuthUser }>();
    const user = req.authUser;
    if (!user) {
      throw new ForbiddenException("Not authenticated");
    }
    if (!required.includes(user.role)) {
      throw new ForbiddenException("Insufficient role");
    }
    return true;
  }
}
