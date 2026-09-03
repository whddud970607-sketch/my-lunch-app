import {
  Body,
  Controller,
  Post,
  Req,
  UseGuards,
} from "@nestjs/common";
import type { SupabaseClient } from "@supabase/supabase-js";
import { AuthGuard } from "../auth/auth.guard";
import { RolesGuard } from "../auth/roles.guard";
import { Roles } from "../auth/roles.decorator";
import { CurrentUser } from "../auth/current-user.decorator";
import type { AuthUser } from "../auth/auth.types";
import { AccessScopeService } from "../access/access-scope.service";
import type { ImportCommitRequest } from "./import-commit.types";
import { ImportCommitService } from "./import-commit.service";

@Controller("import")
@UseGuards(AuthGuard, RolesGuard)
@Roles("driver")
export class ImportCommitController {
  constructor(
    private readonly commitService: ImportCommitService,
    private readonly scope: AccessScopeService,
  ) {}

  @Post("commit")
  async commit(
    @CurrentUser() user: AuthUser,
    @Req() req: { supabaseUser: SupabaseClient },
    @Body() body: ImportCommitRequest,
  ) {
    const driverId = this.scope.forUser(user).requireDriverId();
    const companyIds = user.companyId ? [user.companyId] : [];

    return this.commitService.commit(req.supabaseUser, { driverId, companyIds }, body);
  }
}
