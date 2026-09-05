export type IdentityAppEnv = "development" | "staging" | "production";

/** Explicit opt-in only. Unset / unknown / "false" are all false. */
export function parseExplicitFlag(raw: string | undefined | null): boolean {
  const value = (raw ?? "").trim().toLowerCase();
  return value === "true" || value === "1" || value === "yes";
}

/**
 * Application environment for identity policy.
 * APP_ENV wins when it is a known value. Otherwise NODE_ENV is the fallback.
 * Render may set NODE_ENV=production on a staging Web Service — that is not APP_ENV.
 */
export function resolveIdentityAppEnv(input: {
  appEnv?: string | null;
  nodeEnv?: string | null;
}): IdentityAppEnv {
  const appEnv = (input.appEnv ?? "").trim().toLowerCase();
  if (appEnv === "production") return "production";
  if (appEnv === "staging") return "staging";
  if (
    appEnv === "development" ||
    appEnv === "dev" ||
    appEnv === "local" ||
    appEnv === "test"
  ) {
    return "development";
  }

  const nodeEnv = (input.nodeEnv ?? "development").trim().toLowerCase();
  if (nodeEnv === "production") return "production";
  if (nodeEnv === "staging") return "staging";
  return "development";
}

export function assertStubIdentityAllowed(input: {
  appEnv: IdentityAppEnv;
  allowStubInStaging: boolean;
}): void {
  if (input.appEnv === "production") {
    throw new Error(
      "IDENTITY_PROVIDER=stub is forbidden in production. Configure a real identity provider.",
    );
  }

  if (input.appEnv === "staging" && !input.allowStubInStaging) {
    throw new Error(
      "IDENTITY_PROVIDER=stub is forbidden in staging unless APP_ENV=staging and ALLOW_STUB_IDENTITY_IN_STAGING=true.",
    );
  }
}
