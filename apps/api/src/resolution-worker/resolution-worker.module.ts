import { Module } from "@nestjs/common";
import { ConfigModule, ConfigService } from "@nestjs/config";
import { AddressModule } from "../address/address.module";
import { SupabaseModule } from "../supabase/supabase.module";
import { RESOLUTION_WORKER_REPOSITORY } from "./resolution-worker.repository.port";
import { InMemoryResolutionWorkerRepository } from "./resolution-worker.repository.memory";
import { SupabaseResolutionWorkerRepository } from "./resolution-worker.repository.supabase";
import { ResolutionWorkerRunner } from "./resolution-worker.runner";
import { ResolutionWorkerService } from "./resolution-worker.service";

/**
 * Resolution worker module.
 * Default repository remains in-memory until RESOLUTION_WORKER_USE_SUPABASE=1
 * AND service role is configured (after migration 025 is applied).
 * Poller still requires RESOLUTION_WORKER_ENABLED=1.
 */
@Module({
  imports: [ConfigModule, AddressModule, SupabaseModule],
  providers: [
    ResolutionWorkerService,
    ResolutionWorkerRunner,
    InMemoryResolutionWorkerRepository,
    SupabaseResolutionWorkerRepository,
    {
      provide: RESOLUTION_WORKER_REPOSITORY,
      inject: [
        ConfigService,
        InMemoryResolutionWorkerRepository,
        SupabaseResolutionWorkerRepository,
      ],
      useFactory: (
        config: ConfigService,
        memory: InMemoryResolutionWorkerRepository,
        supabase: SupabaseResolutionWorkerRepository,
      ) => {
        const useSupabase =
          config.get<string>("RESOLUTION_WORKER_USE_SUPABASE") === "1";
        if (useSupabase && supabase.isAvailable()) {
          return supabase;
        }
        return memory;
      },
    },
  ],
  exports: [
    ResolutionWorkerService,
    RESOLUTION_WORKER_REPOSITORY,
    SupabaseResolutionWorkerRepository,
  ],
})
export class ResolutionWorkerModule {}
