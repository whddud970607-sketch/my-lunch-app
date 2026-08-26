import { Module } from "@nestjs/common";
import { ConfigModule } from "@nestjs/config";
import { HealthController } from "./health.controller";
import { SupabaseModule } from "./supabase/supabase.module";
import { AuthModule } from "./auth/auth.module";
import { MeModule } from "./me/me.module";
import { DeliveriesModule } from "./deliveries/deliveries.module";
import { ContactsModule } from "./contacts/contacts.module";
import { AdminModule } from "./admin/admin.module";

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
    ContactsModule,
    AdminModule,
  ],
  controllers: [HealthController],
})
export class AppModule {}
