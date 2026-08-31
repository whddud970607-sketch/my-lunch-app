import { IdentityProviderConfigService } from "./identity-provider-config.service";
import { ConfigService } from "@nestjs/config";

describe("IdentityProviderConfigService", () => {
  it("rejects stub provider in production", () => {
    const config = new ConfigService({
      NODE_ENV: "production",
      IDENTITY_PROVIDER: "stub",
      STUB_IDENTITY_OTP: "123456",
    });
    const service = new IdentityProviderConfigService(config);
    expect(() => service.onModuleInit()).toThrow(/forbidden in production/i);
  });

  it("requires stub otp in development", () => {
    const previous = process.env.STUB_IDENTITY_OTP;
    delete process.env.STUB_IDENTITY_OTP;
    const config = new ConfigService({
      NODE_ENV: "development",
      IDENTITY_PROVIDER: "stub",
    });
    const service = new IdentityProviderConfigService(config);
    try {
      expect(() => service.onModuleInit()).toThrow(/STUB_IDENTITY_OTP is required/i);
    } finally {
      if (previous === undefined) {
        delete process.env.STUB_IDENTITY_OTP;
      } else {
        process.env.STUB_IDENTITY_OTP = previous;
      }
    }
  });
});
