import { Module } from "@nestjs/common";
import { AuthModule } from "../auth/auth.module";
import { AccessScopeService } from "../access/access-scope.service";
import { AccessInfoCryptoService } from "../access/access-info-crypto.service";
import { AccessSecretsRepository } from "../access/access-secrets.repository";
import { AccessSecretsService } from "../access/access-secrets.service";
import { DeliveriesController } from "./deliveries.controller";
import { DeliveriesRepository } from "./deliveries.repository";
import { DeliveryCompletionService } from "./delivery-completion.service";
import { TodayWorksetService } from "./today-workset.service";

@Module({
  imports: [AuthModule],
  controllers: [DeliveriesController],
  providers: [
    DeliveriesRepository,
    DeliveryCompletionService,
    TodayWorksetService,
    AccessScopeService,
    AccessInfoCryptoService,
    AccessSecretsRepository,
    AccessSecretsService,
  ],
  exports: [DeliveriesRepository, AccessScopeService, DeliveryCompletionService],
})
export class DeliveriesModule {}
