import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { Injectable } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";

/**
 * User-scoped Supabase client factory.
 * Pass the caller's access token so Postgres RLS runs as authenticated.
 * Never use service_role here.
 */
@Injectable()
export class SupabaseUserClientFactory {
  constructor(private readonly config: ConfigService) {}

  createForAccessToken(accessToken: string): SupabaseClient {
    const url = this.require("SUPABASE_URL");
    const anonKey = this.require("SUPABASE_ANON_KEY");

    return createClient(url, anonKey, {
      auth: {
        persistSession: false,
        autoRefreshToken: false,
        detectSessionInUrl: false,
      },
      global: {
        headers: {
          Authorization: `Bearer ${accessToken}`,
        },
      },
    });
  }

  private require(key: string): string {
    const value = this.config.get<string>(key);
    if (!value) {
      throw new Error(`Missing required env: ${key}`);
    }
    return value;
  }
}
