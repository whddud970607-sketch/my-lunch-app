import { Injectable } from "@nestjs/common";
import { createHash, randomBytes } from "crypto";
import { ConfigService } from "@nestjs/config";

@Injectable()
export class RecoveryTokenService {
  constructor(private readonly config: ConfigService) {}

  createToken(): { token: string; tokenHash: string; expiresAt: Date } {
    const token = randomBytes(32).toString("base64url");
    const tokenHash = this.hashToken(token);
    const ttlSeconds = Number(
      this.config.get<string>("RECOVERY_TOKEN_TTL_SECONDS") ?? 900,
    );
    const expiresAt = new Date(Date.now() + ttlSeconds * 1000);
    return { token, tokenHash, expiresAt };
  }

  hashToken(token: string): string {
    return createHash("sha256").update(token).digest("hex");
  }
}
