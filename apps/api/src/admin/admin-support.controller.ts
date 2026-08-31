import {
  Body,
  Controller,
  Get,
  Param,
  Post,
  Query,
  UseGuards,
} from "@nestjs/common";
import { AuthGuard } from "../auth/auth.guard";
import { Roles } from "../auth/roles.decorator";
import { RolesGuard } from "../auth/roles.guard";
import { AdminSupportService } from "./admin-support.service";

@Controller("admin/support")
@UseGuards(AuthGuard, RolesGuard)
@Roles("platform_admin")
export class AdminSupportController {
  constructor(private readonly support: AdminSupportService) {}

  @Get("users/search")
  searchUsers(
    @Query("legalName") legalName?: string,
    @Query("birthDate") birthDate?: string,
    @Query("phoneFragment") phoneFragment?: string,
    @Query("emailFragment") emailFragment?: string,
  ) {
    return this.support.searchUsers({
      legalName,
      birthDate,
      phoneFragment,
      emailFragment,
    });
  }

  @Post("users/:userId/grant-recovery")
  grantRecovery(
    @Param("userId") userId: string,
    @Body() body: { reason?: string },
  ) {
    return this.support.grantRecoveryAccess({
      userId,
      method: "admin_grant",
      reason: body.reason?.trim() ?? "",
    });
  }
}
