import { Module } from "@nestjs/common";
import { ConfigModule } from "@nestjs/config";
import { HealthController } from "./health.controller";
import { SupabaseModule } from "./supabase/supabase.module";
import { AuthModule } from "./auth/auth.module";
import { MeModule } from "./me/me.module";
import { DeliveriesModule } from "./deliveries/deliveries.module";
import { ContactsModule } from "./contacts/contacts.module";
import { AdminModule } from "./admin/admin.module";
import { AccountRecoveryModule } from "./account-recovery/account-recovery.module";
import { DeliverySessionsModule } from "./delivery-sessions/delivery-sessions.module";
import { WorkdayModule } from "./workday/workday.module";
import { ImportModule } from "./import/import.module";
import { AddressModule } from "./address/address.module";
import { ResolutionWorkerModule } from "./resolution-worker/resolution-worker.module";

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: [".env", "apps/api/.env"],
    }),
    SupabaseModule,
    AuthModule,
    MeModule,
    DeliveriesModule,
    DeliverySessionsModule,
    WorkdayModule,
    ContactsModule,
    AdminModule,
    AccountRecoveryModule,
    ImportModule,
    AddressModule,
    ResolutionWorkerModule,
  ],
  controllers: [HealthController],
})
export class AppModule {}
