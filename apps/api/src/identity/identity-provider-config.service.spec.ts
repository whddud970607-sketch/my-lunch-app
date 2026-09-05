import { IdentityProviderConfigService } from "./identity-provider-config.service";
import { ConfigService } from "@nestjs/config";
import {
  parseExplicitFlag,
  resolveIdentityAppEnv,
} from "./identity-runtime-env";

function initWith(env: Record<string, string | undefined>) {
  const service = new IdentityProviderConfigService(new ConfigService(env));
  return () => service.onModuleInit();
}

describe("identity runtime env", () => {
  it("treats only explicit true/1/yes as opt-in", () => {
    expect(parseExplicitFlag(undefined)).toBe(false);
    expect(parseExplicitFlag("")).toBe(false);
    expect(parseExplicitFlag("false")).toBe(false);
    expect(parseExplicitFlag("0")).toBe(false);
    expect(parseExplicitFlag("maybe")).toBe(false);
    expect(parseExplicitFlag("true")).toBe(true);
    expect(parseExplicitFlag("TRUE")).toBe(true);
    expect(parseExplicitFlag("1")).toBe(true);
    expect(parseExplicitFlag("yes")).toBe(true);
  });

  it("lets APP_ENV win over NODE_ENV", () => {
    expect(
      resolveIdentityAppEnv({ appEnv: "staging", nodeEnv: "production" }),
    ).toBe("staging");
    expect(
      resolveIdentityAppEnv({ appEnv: "production", nodeEnv: "development" }),
    ).toBe("production");
    expect(
      resolveIdentityAppEnv({ appEnv: "development", nodeEnv: "production" }),
    ).toBe("development");
  });

  it("falls back to NODE_ENV when APP_ENV is unset or unknown", () => {
    expect(resolveIdentityAppEnv({ nodeEnv: "production" })).toBe("production");
    expect(resolveIdentityAppEnv({ nodeEnv: "staging" })).toBe("staging");
    expect(resolveIdentityAppEnv({ nodeEnv: "test" })).toBe("development");
    expect(resolveIdentityAppEnv({ appEnv: "preview", nodeEnv: "production" })).toBe(
      "production",
    );
  });
});

describe("IdentityProviderConfigService", () => {
  it("rejects stub provider in production (NODE_ENV)", () => {
    expect(
      initWith({
        NODE_ENV: "production",
        IDENTITY_PROVIDER: "stub",
        STUB_IDENTITY_OTP: "123456",
      }),
    ).toThrow(/forbidden in production/i);
  });

  it("rejects stub provider when APP_ENV=production even if NODE_ENV is development", () => {
    expect(
      initWith({
        APP_ENV: "production",
        NODE_ENV: "development",
        IDENTITY_PROVIDER: "stub",
        STUB_IDENTITY_OTP: "123456",
      }),
    ).toThrow(/forbidden in production/i);
  });

  it("does not allow staging opt-in to override production", () => {
    expect(
      initWith({
        NODE_ENV: "production",
        APP_ENV: "production",
        ALLOW_STUB_IDENTITY_IN_STAGING: "true",
        IDENTITY_PROVIDER: "stub",
        STUB_IDENTITY_OTP: "123456",
      }),
    ).toThrow(/forbidden in production/i);
  });

  it("rejects stub on Render-like production runtime without APP_ENV=staging", () => {
    expect(
      initWith({
        NODE_ENV: "production",
        ALLOW_STUB_IDENTITY_IN_STAGING: "true",
        IDENTITY_PROVIDER: "stub",
        STUB_IDENTITY_OTP: "123456",
      }),
    ).toThrow(/forbidden in production/i);
  });

  it("rejects stub in staging when opt-in is missing or false", () => {
    expect(
      initWith({
        NODE_ENV: "production",
        APP_ENV: "staging",
        IDENTITY_PROVIDER: "stub",
        STUB_IDENTITY_OTP: "123456",
      }),
    ).toThrow(/ALLOW_STUB_IDENTITY_IN_STAGING=true/i);

    expect(
      initWith({
        NODE_ENV: "production",
        APP_ENV: "staging",
        ALLOW_STUB_IDENTITY_IN_STAGING: "false",
        IDENTITY_PROVIDER: "stub",
        STUB_IDENTITY_OTP: "123456",
      }),
    ).toThrow(/ALLOW_STUB_IDENTITY_IN_STAGING=true/i);
  });

  it("allows stub in staging only with explicit dual opt-in", () => {
    expect(
      initWith({
        NODE_ENV: "production",
        APP_ENV: "staging",
        ALLOW_STUB_IDENTITY_IN_STAGING: "true",
        IDENTITY_PROVIDER: "stub",
        STUB_IDENTITY_OTP: "123456",
      }),
    ).not.toThrow();
  });

  it("still requires stub otp after staging opt-in", () => {
    const previous = process.env.STUB_IDENTITY_OTP;
    delete process.env.STUB_IDENTITY_OTP;
    try {
      expect(
        initWith({
          NODE_ENV: "production",
          APP_ENV: "staging",
          ALLOW_STUB_IDENTITY_IN_STAGING: "true",
          IDENTITY_PROVIDER: "stub",
        }),
      ).toThrow(/STUB_IDENTITY_OTP is required/i);
    } finally {
      if (previous === undefined) {
        delete process.env.STUB_IDENTITY_OTP;
      } else {
        process.env.STUB_IDENTITY_OTP = previous;
      }
    }
  });

  it("allows stub in local development with otp (existing behavior)", () => {
    expect(
      initWith({
        NODE_ENV: "development",
        IDENTITY_PROVIDER: "stub",
        STUB_IDENTITY_OTP: "123456",
      }),
    ).not.toThrow();
  });

  it("requires stub otp in development", () => {
    const previous = process.env.STUB_IDENTITY_OTP;
    delete process.env.STUB_IDENTITY_OTP;
    try {
      expect(
        initWith({
          NODE_ENV: "development",
          IDENTITY_PROVIDER: "stub",
        }),
      ).toThrow(/STUB_IDENTITY_OTP is required/i);
    } finally {
      if (previous === undefined) {
        delete process.env.STUB_IDENTITY_OTP;
      } else {
        process.env.STUB_IDENTITY_OTP = previous;
      }
    }
  });
});
