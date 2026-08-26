import { Module } from "@nestjs/common";
import { AuthModule } from "../auth/auth.module";
import { AccessScopeService } from "../access/access-scope.service";
import { AdminController } from "./admin.controller";

@Module({
  imports: [AuthModule],
  controllers: [AdminController],
  providers: [AccessScopeService],
})
export class AdminModule {}
