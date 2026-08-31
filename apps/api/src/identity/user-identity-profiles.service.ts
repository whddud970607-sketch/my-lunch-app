import { ConflictException, Injectable, Logger } from "@nestjs/common";
import { AccountRecoveryRepository } from "../account-recovery/account-recovery.repository";
import { normalizeKrPhoneToE164 } from "../account-recovery/account-recovery.util";

export type ProvisionIdentityProfileInput = {
  userId: string;
  legalName: string;
  birthDate: string;
  phone: string;
  phoneVerifiedAt?: string;
  termsAcceptedAt?: string;
  privacyAcceptedAt?: string;
};

/**
 * Creates user_identity_profiles during the final signup flow (Phase B+).
 * Test-only backfill must use scripts/seed-test-driver-identity.mjs instead.
 */
@Injectable()
export class UserIdentityProfilesService {
  private readonly logger = new Logger(UserIdentityProfilesService.name);

  constructor(private readonly repository: AccountRecoveryRepository) {}

  async provisionOnSignup(
    input: ProvisionIdentityProfileInput,
  ): Promise<"created" | "already_exists"> {
    const phoneE164 = normalizeKrPhoneToE164(input.phone);
    if (!phoneE164) {
      throw new ConflictException("Invalid phone number");
    }

    const existing = await this.repository.findIdentityProfileByUserId(input.userId);
    if (existing) {
      return "already_exists";
    }

    await this.repository.insertIdentityProfile({
      userId: input.userId,
      legalName: input.legalName.trim(),
      birthDate: input.birthDate,
      phoneE164,
      phoneVerifiedAt: input.phoneVerifiedAt ?? new Date().toISOString(),
      termsAcceptedAt: input.termsAcceptedAt ?? null,
      privacyAcceptedAt: input.privacyAcceptedAt ?? null,
    });

    this.logger.log(`identity profile provisioned user=${input.userId.slice(0, 8)}`);
    return "created";
  }
}
