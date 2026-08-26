import { Module } from "@nestjs/common";
import { CarrierIngestContactProvider } from "./carrier-ingest.contact-provider";

export const CONTACT_PROVIDER = Symbol("CONTACT_PROVIDER");

@Module({
  providers: [
    CarrierIngestContactProvider,
    {
      provide: CONTACT_PROVIDER,
      useExisting: CarrierIngestContactProvider,
    },
  ],
  exports: [CONTACT_PROVIDER, CarrierIngestContactProvider],
})
export class ContactsModule {}
