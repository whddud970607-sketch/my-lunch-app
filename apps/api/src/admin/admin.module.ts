import { Module } from "@nestjs/common";
import { AuthModule } from "../auth/auth.module";
import { AccessScopeService } from "../access/access-scope.service";
import { AdminController } from "./admin.controller";
import { AdminSupportController } from "./admin-support.controller";
import { AdminSupportService } from "./admin-support.service";

@Module({
  imports: [AuthModule],
  controllers: [AdminController, AdminSupportController],
  providers: [AccessScopeService, AdminSupportService],
})
export class AdminModule {}
