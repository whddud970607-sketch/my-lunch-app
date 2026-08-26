import { Controller, Post, UseGuards } from "@nestjs/common";
import { AuthGuard } from "../auth/auth.guard";
import { AccessScopeService } from "../access/access-scope.service";

/**
 * Intentionally no working promote endpoint — clients must be denied.
 */
@Controller("admin")
@UseGuards(AuthGuard)
export class AdminController {
  constructor(private readonly scope: AccessScopeService) {}

  @Post("promote-platform-admin")
  promotePlatformAdmin() {
    return this.scope.denyClientRoleElevation();
  }
}
