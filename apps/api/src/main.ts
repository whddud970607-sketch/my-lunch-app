import "reflect-metadata";
import { NestFactory } from "@nestjs/core";
import { NestExpressApplication } from "@nestjs/platform-express";
import { AppModule } from "./app.module";

async function bootstrap() {
  const app = await NestFactory.create<NestExpressApplication>(AppModule, {
    logger: ["error", "warn", "log"],
  });
  // Invoice evidence is compressed JPEG/PNG/WebP (max 5MB) sent as JSON base64.
  app.useBodyParser("json", { limit: "8mb" });
  app.useBodyParser("urlencoded", { limit: "8mb", extended: true });
  app.setGlobalPrefix("v1");
  const port = Number(process.env.PORT ?? 4000);
  // Bind all interfaces so a physical device on the same LAN can reach the API.
  const host = process.env.HOST ?? "0.0.0.0";
  await app.listen(port, host);
  // Do not log secrets or customer PII.
  console.log(
    `Delivery Shield API listening on http://${host}:${port}/v1`,
  );
}

void bootstrap();
