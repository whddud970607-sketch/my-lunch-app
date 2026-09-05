import { Injectable, OnModuleInit } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import {
  assertStubIdentityAllowed,
  parseExplicitFlag,
  resolveIdentityAppEnv,
} from "./identity-runtime-env";

export type IdentityProviderKind = "stub";

@Injectable()
export class IdentityProviderConfigService implements OnModuleInit {
  constructor(private readonly config: ConfigService) {}

  onModuleInit() {
    const provider = this.getProviderKind();
    const appEnv = resolveIdentityAppEnv({
      appEnv: this.config.get<string>("APP_ENV"),
      nodeEnv: this.config.get<string>("NODE_ENV") ?? "development",
    });

    if (provider === "stub") {
      assertStubIdentityAllowed({
        appEnv,
        allowStubInStaging: parseExplicitFlag(
          this.config.get<string>("ALLOW_STUB_IDENTITY_IN_STAGING"),
        ),
      });
    }

    if (provider === "stub" && !this.getStubOtp()) {
      throw new Error(
        "STUB_IDENTITY_OTP is required when IDENTITY_PROVIDER=stub (dev/test only).",
      );
    }
  }

  getProviderKind(): IdentityProviderKind {
    const raw = (this.config.get<string>("IDENTITY_PROVIDER") ?? "stub").trim();
    if (raw !== "stub") {
      throw new Error(
        `Unsupported IDENTITY_PROVIDER=${raw}. Phase A supports stub only.`,
      );
    }
    return "stub";
  }

  getStubOtp(): string {
    return (this.config.get<string>("STUB_IDENTITY_OTP") ?? "").trim();
  }

  getVerificationTtlSeconds(): number {
    return Number(this.config.get<string>("IDENTITY_VERIFICATION_TTL_SECONDS") ?? 600);
  }
}
