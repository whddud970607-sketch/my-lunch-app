import { Module } from "@nestjs/common";
import { AuthModule } from "../auth/auth.module";
import { AccessScopeService } from "../access/access-scope.service";
import { WorkdayExecutionConfig } from "../config/workday-execution.config";
import { WorkdayModule } from "../workday/workday.module";
import { DeliverySessionsController } from "./delivery-sessions.controller";
import { DeliverySessionsRepository } from "./delivery-sessions.repository";
import { DeliverySessionsService } from "./delivery-sessions.service";

@Module({
  imports: [AuthModule, WorkdayModule],
  controllers: [DeliverySessionsController],
  providers: [
    DeliverySessionsRepository,
    DeliverySessionsService,
    AccessScopeService,
    WorkdayExecutionConfig,
  ],
  exports: [DeliverySessionsService],
})
export class DeliverySessionsModule {}
