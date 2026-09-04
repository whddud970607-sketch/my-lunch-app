import { Module } from "@nestjs/common";
import { AuthModule } from "../auth/auth.module";
import { AddressModule } from "../address/address.module";
import { ImportModule } from "../import/import.module";
import { AccessScopeService } from "../access/access-scope.service";
import { AccessInfoCryptoService } from "../access/access-info-crypto.service";
import { AccessSecretsRepository } from "../access/access-secrets.repository";
import { AccessSecretsService } from "../access/access-secrets.service";
import { DeliveriesController } from "./deliveries.controller";
import { DeliveriesRepository } from "./deliveries.repository";
import { DeliveryCompletionService } from "./delivery-completion.service";
import { TodayWorksetService } from "./today-workset.service";
import { DeliveryAddressSearchService } from "./delivery-address-search.service";
import { DeliveryManualAddressSuggestService } from "./delivery-manual-address-suggest.service";
import { DeliveryManualRegisterService } from "./delivery-manual-register.service";

@Module({
  imports: [AuthModule, AddressModule, ImportModule],
  controllers: [DeliveriesController],
  providers: [
    DeliveriesRepository,
    DeliveryCompletionService,
    TodayWorksetService,
    DeliveryAddressSearchService,
    DeliveryManualAddressSuggestService,
    DeliveryManualRegisterService,
    AccessScopeService,
    AccessInfoCryptoService,
    AccessSecretsRepository,
    AccessSecretsService,
  ],
  exports: [DeliveriesRepository, AccessScopeService, DeliveryCompletionService],
})
export class DeliveriesModule {}
