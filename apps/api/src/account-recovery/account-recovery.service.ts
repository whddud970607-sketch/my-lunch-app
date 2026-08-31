import {
  BadRequestException,
  Injectable,
  Logger,
  UnauthorizedException,
} from "@nestjs/common";
import { randomUUID } from "crypto";
import { SupabaseServiceClient } from "../supabase/supabase-service.client";
import { IdentityVerificationService } from "../identity/identity-verification.service";
import { AccountRecoveryRepository } from "./account-recovery.repository";
import {
  birthDateErrorMessage,
  hashIp,
  isValidPassword,
  maskEmail,
  normalizeKrPhoneToE164,
  validateBirthDate,
} from "./account-recovery.util";
import { RecoveryRateLimitService } from "./recovery-rate-limit.service";
import { RecoveryTokenService } from "./recovery-token.service";

@Injectable()
export class AccountRecoveryService {
  private readonly logger = new Logger(AccountRecoveryService.name);

  constructor(
    private readonly repository: AccountRecoveryRepository,
    private readonly identity: IdentityVerificationService,
    private readonly tokens: RecoveryTokenService,
    private readonly rateLimit: RecoveryRateLimitService,
    private readonly serviceClient: SupabaseServiceClient,
  ) {}

  async startResetPassword(input: {
    legalName: string;
    birthDate: string;
    phone: string;
    clientIp?: string;
  }) {
    if (!input.legalName.trim()) {
      throw new BadRequestException("legalName is required");
    }
    const birthResult = validateBirthDate(input.birthDate);
    if (!birthResult.ok) {
      throw new BadRequestException(birthDateErrorMessage(birthResult));
    }
    const birthDate = birthResult.value;

    const phoneE164 = normalizeKrPhoneToE164(input.phone);
    if (!phoneE164) {
      throw new BadRequestException("휴대폰번호를 정확히 입력해주세요.");
    }

    const rateKey = `reset-start:${phoneE164}:${hashIp(input.clientIp) ?? "unknown"}`;
    this.rateLimit.check(rateKey);

    const profile = await this.repository.findIdentityProfile({
      legalName: input.legalName,
      birthDate,
      phoneE164,
    });

    const providerSession = await this.identity.startSession({
      phoneE164,
      purpose: "reset_password",
    });

    const sessionId = randomUUID();
    await this.repository.createVerificationSession({
      id: sessionId,
      userId: profile?.user_id ?? null,
      purpose: "reset_password",
      provider: this.identity.providerId,
      providerSessionId: providerSession.sessionId,
      phoneE164,
      expiresAt: providerSession.expiresAt,
      metadata: {
        legalName: input.legalName.trim(),
        birthDate,
      },
    });

    await this.repository.recordAttempt({
      userId: profile?.user_id ?? null,
      method: "phone",
      result: profile ? "start_matched" : "start_no_match",
      ipHash: hashIp(input.clientIp),
      metadata: { step: "start" },
    });

    await this.repository.writeAuditLog({
      actorId: profile?.user_id ?? null,
      action: "account_recovery_phone_start",
      resourceId: sessionId,
      metadata: { provider: this.identity.providerId },
    });

    return {
      verificationSessionId: sessionId,
      expiresAt: providerSession.expiresAt,
    };
  }

  async confirmResetPassword(input: {
    verificationSessionId: string;
    otp: string;
    clientIp?: string;
  }) {
    if (!input.verificationSessionId || !input.otp) {
      throw new BadRequestException("verificationSessionId and otp are required");
    }

    const rateKey = `reset-confirm:${input.verificationSessionId}`;
    this.rateLimit.check(rateKey);

    const session = await this.repository.getVerificationSession(
      input.verificationSessionId,
    );
    if (!session || session.status !== "pending") {
      throw new UnauthorizedException("Verification session not found or expired");
    }

    if (new Date(session.expires_at).getTime() < Date.now()) {
      throw new UnauthorizedException("Verification session expired");
    }

    if (!session.user_id) {
      await this.repository.recordAttempt({
        userId: null,
        method: "phone",
        result: "confirm_no_account",
        ipHash: hashIp(input.clientIp),
      });
      throw new UnauthorizedException("Account verification failed");
    }

    const confirmed = await this.identity.confirmSession({
      sessionId: session.provider_session_id ?? "",
      otp: input.otp,
    });

    if (!confirmed.verified || confirmed.phoneE164 !== session.phone_e164) {
      await this.repository.recordAttempt({
        userId: session.user_id,
        method: "phone",
        result: "confirm_otp_failed",
        ipHash: hashIp(input.clientIp),
      });
      throw new UnauthorizedException("Verification failed");
    }

    await this.repository.markVerificationVerified(session.id);

    const { token, tokenHash, expiresAt } = this.tokens.createToken();
    const tokenId = randomUUID();
    await this.repository.createRecoveryToken({
      id: tokenId,
      userId: session.user_id,
      tokenHash,
      expiresAt: expiresAt.toISOString(),
    });

    const email = await this.repository.getUserEmail(session.user_id);

    await this.repository.recordAttempt({
      userId: session.user_id,
      method: "phone",
      result: "confirm_success",
      ipHash: hashIp(input.clientIp),
    });

    await this.repository.writeAuditLog({
      actorId: session.user_id,
      action: "account_recovery_phone_complete",
      resourceId: tokenId,
      metadata: { method: "phone" },
    });

    return {
      recoveryToken: token,
      expiresAt: expiresAt.toISOString(),
      maskedEmail: email ? maskEmail(email) : null,
    };
  }

  async completeResetPassword(input: {
    recoveryToken: string;
    newPassword: string;
    clientIp?: string;
  }) {
    if (!input.recoveryToken) {
      throw new BadRequestException("recoveryToken is required");
    }
    if (!isValidPassword(input.newPassword)) {
      throw new BadRequestException("Password must be at least 8 characters");
    }

    const rateKey = `reset-complete:${this.tokens.hashToken(input.recoveryToken).slice(0, 12)}`;
    this.rateLimit.check(rateKey);

    const tokenHash = this.tokens.hashToken(input.recoveryToken);
    const row = await this.repository.getRecoveryTokenByHash(tokenHash);
    if (!row) {
      throw new UnauthorizedException("Invalid or expired recovery token");
    }
    if (row.consumed_at) {
      throw new UnauthorizedException("Recovery token already used");
    }
    if (new Date(row.expires_at).getTime() < Date.now()) {
      throw new UnauthorizedException("Recovery token expired");
    }

    const consumed = await this.repository.consumeRecoveryToken(row.id);
    if (!consumed) {
      throw new UnauthorizedException("Recovery token already used");
    }

    const admin = this.serviceClient.getOrNull();
    if (!admin) {
      throw new Error("Service role client unavailable");
    }

    const updated = await admin.auth.admin.updateUserById(row.user_id, {
      password: input.newPassword,
    });
    if (updated.error) {
      this.logger.warn(`password update failed user=${row.user_id.slice(0, 8)}`);
      throw new UnauthorizedException("Password update failed");
    }

    const email = updated.data.user.email ?? (await this.repository.getUserEmail(row.user_id));

    await this.repository.recordAttempt({
      userId: row.user_id,
      method: "phone",
      result: "complete_success",
      ipHash: hashIp(input.clientIp),
    });

    await this.repository.writeAuditLog({
      actorId: row.user_id,
      action: "password_reset_complete",
      resourceId: row.id,
      metadata: { method: "phone" },
    });

    return {
      success: true,
      email,
    };
  }
}
