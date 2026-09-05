import { Module } from "@nestjs/common";
import { AddressResolutionService } from "./address-resolution.service";
import { AddressResolverAdapter, ADDRESS_RESOLVER } from "./address-resolver.adapter";
import { ManualAddressCoordinateResolver } from "./manual-address-coordinate-resolver";

@Module({
  providers: [
    AddressResolutionService,
    ManualAddressCoordinateResolver,
    AddressResolverAdapter,
    {
      provide: ADDRESS_RESOLVER,
      useExisting: AddressResolverAdapter,
    },
  ],
  exports: [
    AddressResolutionService,
    ManualAddressCoordinateResolver,
    AddressResolverAdapter,
    ADDRESS_RESOLVER,
  ],
})
export class AddressModule {}
