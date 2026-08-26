import { Global, Module } from "@nestjs/common";
import { ConfigModule } from "@nestjs/config";
import { SupabaseUserClientFactory } from "./supabase-user.client";
import { SupabaseServiceClient } from "./supabase-service.client";

@Global()
@Module({
  imports: [ConfigModule],
  providers: [SupabaseUserClientFactory, SupabaseServiceClient],
  exports: [SupabaseUserClientFactory, SupabaseServiceClient],
})
export class SupabaseModule {}
