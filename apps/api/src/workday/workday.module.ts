import { Module } from "@nestjs/common";
import { AuthModule } from "../auth/auth.module";
import { AccessScopeService } from "../access/access-scope.service";
import { WorkdayController } from "./workday.controller";
import { WorkdayRepository } from "./workday.repository";
import { WorkdayService } from "./workday.service";

@Module({
  imports: [AuthModule],
  controllers: [WorkdayController],
  providers: [WorkdayRepository, WorkdayService, AccessScopeService],
  exports: [WorkdayService],
})
export class WorkdayModule {}
