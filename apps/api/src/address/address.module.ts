import { Module } from "@nestjs/common";
import { AddressResolutionService } from "./address-resolution.service";
import { AddressResolverAdapter, ADDRESS_RESOLVER } from "./address-resolver.adapter";

@Module({
  providers: [
    AddressResolutionService,
    AddressResolverAdapter,
    {
      provide: ADDRESS_RESOLVER,
      useExisting: AddressResolverAdapter,
    },
  ],
  exports: [AddressResolutionService, AddressResolverAdapter, ADDRESS_RESOLVER],
})
export class AddressModule {}
