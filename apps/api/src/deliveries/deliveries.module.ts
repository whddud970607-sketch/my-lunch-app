import { Module } from "@nestjs/common";
import { AuthModule } from "../auth/auth.module";
import { AccessScopeService } from "../access/access-scope.service";
import { DeliveriesController } from "./deliveries.controller";
import { DeliveriesRepository } from "./deliveries.repository";

@Module({
  imports: [AuthModule],
  controllers: [DeliveriesController],
  providers: [DeliveriesRepository, AccessScopeService],
  exports: [DeliveriesRepository, AccessScopeService],
})
export class DeliveriesModule {}
