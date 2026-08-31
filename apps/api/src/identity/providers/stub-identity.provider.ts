import { Injectable, UnauthorizedException } from "@nestjs/common";
import { randomUUID } from "crypto";
import { IdentityProviderConfigService } from "../identity-provider-config.service";
import {
  ConfirmIdentitySessionInput,
  ConfirmIdentitySessionResult,
  IdentityVerificationProvider,
  StartIdentitySessionInput,
  StartIdentitySessionResult,
} from "../identity-verification.provider";

type StubRecord = {
  phoneE164: string;
  expiresAtMs: number;
};

@Injectable()
export class StubIdentityVerificationProvider implements IdentityVerificationProvider {
  readonly providerId = "stub";

  private readonly sessions = new Map<string, StubRecord>();

  constructor(private readonly config: IdentityProviderConfigService) {}

  async startSession(input: StartIdentitySessionInput): Promise<StartIdentitySessionResult> {
    const sessionId = randomUUID();
    const ttlMs = this.config.getVerificationTtlSeconds() * 1000;
    const expiresAtMs = Date.now() + ttlMs;

    this.sessions.set(sessionId, {
      phoneE164: input.phoneE164,
      expiresAtMs,
    });

    return {
      sessionId,
      providerSessionId: `stub-${sessionId}`,
      expiresAt: new Date(expiresAtMs).toISOString(),
    };
  }

  async confirmSession(input: ConfirmIdentitySessionInput): Promise<ConfirmIdentitySessionResult> {
    const record = this.sessions.get(input.sessionId);
    if (!record) {
      throw new UnauthorizedException("Verification session not found or expired");
    }

    if (Date.now() > record.expiresAtMs) {
      this.sessions.delete(input.sessionId);
      throw new UnauthorizedException("Verification session expired");
    }

    const expected = this.config.getStubOtp();
    if (!expected || input.otp !== expected) {
      throw new UnauthorizedException("Invalid verification code");
    }

    this.sessions.delete(input.sessionId);
    return {
      verified: true,
      phoneE164: record.phoneE164,
    };
  }
}
