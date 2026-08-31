export type StartIdentitySessionInput = {
  phoneE164: string;
  purpose: string;
};

export type StartIdentitySessionResult = {
  sessionId: string;
  providerSessionId: string;
  expiresAt: string;
};

export type ConfirmIdentitySessionInput = {
  sessionId: string;
  otp: string;
};

export type ConfirmIdentitySessionResult = {
  verified: boolean;
  phoneE164: string;
};

export interface IdentityVerificationProvider {
  readonly providerId: string;
  startSession(input: StartIdentitySessionInput): Promise<StartIdentitySessionResult>;
  confirmSession(input: ConfirmIdentitySessionInput): Promise<ConfirmIdentitySessionResult>;
}

export const IDENTITY_VERIFICATION_PROVIDER = Symbol("IDENTITY_VERIFICATION_PROVIDER");
