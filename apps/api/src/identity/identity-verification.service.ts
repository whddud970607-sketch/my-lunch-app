import { Inject, Injectable } from "@nestjs/common";
import {
  ConfirmIdentitySessionInput,
  ConfirmIdentitySessionResult,
  IDENTITY_VERIFICATION_PROVIDER,
  IdentityVerificationProvider,
  StartIdentitySessionInput,
  StartIdentitySessionResult,
} from "./identity-verification.provider";

@Injectable()
export class IdentityVerificationService {
  constructor(
    @Inject(IDENTITY_VERIFICATION_PROVIDER)
    private readonly provider: IdentityVerificationProvider,
  ) {}

  get providerId(): string {
    return this.provider.providerId;
  }

  startSession(input: StartIdentitySessionInput): Promise<StartIdentitySessionResult> {
    return this.provider.startSession(input);
  }

  confirmSession(input: ConfirmIdentitySessionInput): Promise<ConfirmIdentitySessionResult> {
    return this.provider.confirmSession(input);
  }
}
