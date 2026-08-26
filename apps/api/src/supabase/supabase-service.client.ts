import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { Injectable, Logger, OnModuleInit } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";

/**
 * Service-role client for rare server-only operations
 * (e.g. emergency profile bootstrap if auth trigger lag, purge jobs, signed URLs).
 * Do NOT use for ordinary driver/company request data access.
 */
@Injectable()
export class SupabaseServiceClient implements OnModuleInit {
  private readonly logger = new Logger(SupabaseServiceClient.name);
  private client: SupabaseClient | null = null;

  constructor(private readonly config: ConfigService) {}

  onModuleInit() {
    const url = this.config.get<string>("SUPABASE_URL");
    const key = this.config.get<string>("SUPABASE_SERVICE_ROLE_KEY");
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
