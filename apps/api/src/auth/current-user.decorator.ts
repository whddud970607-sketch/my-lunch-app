import { createParamDecorator, ExecutionContext } from "@nestjs/common";
import type { AuthUser } from "./auth.types";

export const CurrentUser = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): AuthUser => {
    const req = ctx.switchToHttp().getRequest<{ authUser: AuthUser }>();
    return req.authUser;
  },
);
