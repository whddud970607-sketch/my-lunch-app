/**
 * PHASE_2C.5 provider readiness precheck — Nest ConfigService path.
 * Compile with `npm run build`, then run:
 *   node dist/scripts/provider-config-precheck.js
 *
 * Prints exactly five YES/NO lines. Never prints configuration values.
 */
import "reflect-metadata";
import { NestFactory } from "@nestjs/core";
import { ConfigModule, ConfigService } from "@nestjs/config";
import { isBuildingHubConfigured } from "../address/adapters/building-hub.adapter";
import { isVworldConfigured } from "../address/adapters/vworld.adapter";
import { isKakaoParcelConfigured } from "../address/adapters/kakao-parcel.adapter";
import { NaverGeocodeAdapter } from "../address/adapters/naver-geocode.adapter";

function yn(value: boolean): "YES" | "NO" {
  return value ? "YES" : "NO";
}

async function main(): Promise<void> {
  // Minimal Nest context: ConfigModule only (same envFilePath as AppModule).
  // No HTTP server, no AppModule, no workers, no Supabase client.
  const app = await NestFactory.createApplicationContext(
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: [".env", "apps/api/.env"],
    }),
    { logger: false },
  );

  try {
    const config = app.get(ConfigService);

    const buildingHub = isBuildingHubConfigured(config);
    const vworld = isVworldConfigured(config);
    const kakao = isKakaoParcelConfigured(config);
    const naver = new NaverGeocodeAdapter(
      config.get<string>("NAVER_MAP_CLIENT_ID"),
      config.get<string>("NAVER_MAP_CLIENT_SECRET"),
    ).isConfigured();

    const supabaseWorkerRepo =
      Boolean(config.get<string>("SUPABASE_URL")?.trim()) &&
      Boolean(config.get<string>("SUPABASE_SERVICE_ROLE_KEY")?.trim());

    console.log(`BUILDING_HUB_CONFIGURED = ${yn(buildingHub)}`);
    console.log(`VWORLD_CONFIGURED = ${yn(vworld)}`);
    console.log(`KAKAO_CONFIGURED = ${yn(kakao)}`);
    console.log(`NAVER_CONFIGURED = ${yn(naver)}`);
    console.log(
      `SUPABASE_WORKER_REPOSITORY_CONFIGURED = ${yn(supabaseWorkerRepo)}`,
    );
  } finally {
    await app.close();
  }
}

main().catch(() => {
  console.error("PRECHECK_FAILED = YES");
  process.exit(1);
});
