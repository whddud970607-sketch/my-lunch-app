import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { Injectable, Logger, OnModuleInit } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { normalizeConfigSecret } from "./supabase-error-log";

/**
 * Service-role client for rare server-only operations
 * (e.g. emergency profile bootstrap if auth trigger lag, purge jobs, signed URLs).
 * Do NOT use for ordinary driver/company request data access.
 *
 * Client is initialized in the constructor (not only onModuleInit) so
 * factories that inject this provider during DI setup see a ready client.
 */
@Injectable()
export class SupabaseServiceClient implements OnModuleInit {
  private readonly logger = new Logger(SupabaseServiceClient.name);
  private client: SupabaseClient | null = null;

  constructor(private readonly config: ConfigService) {
    this.initialize();
  }

  onModuleInit() {
    this.initialize();
  }

  private initialize(): void {
    if (this.client) return;
    const url = normalizeConfigSecret(this.config.get<string>("SUPABASE_URL"));
    const key = normalizeConfigSecret(
      this.config.get<string>("SUPABASE_SERVICE_ROLE_KEY"),
    );
    if (!url || !key) {
      this.logger.warn(
        "SUPABASE_SERVICE_ROLE_KEY not set; service-only paths disabled",
      );
      return;
    }
    this.client = createClient(url, key, {
      auth: {
        persistSession: false,
        autoRefreshToken: false,
      },
    });
    this.logger.log(
      `service_role client ready jwt_shape=${key.startsWith("eyJ")}`,
    );
  }

  /** Returns null when service role is not configured. */
  getOrNull(): SupabaseClient | null {
    return this.client;
  }

  getRequired(): SupabaseClient {
    if (!this.client) {
      throw new Error("Service-role Supabase client is not configured");
    }
    return this.client;
  }
}
