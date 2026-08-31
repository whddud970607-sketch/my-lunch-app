import { Injectable, Logger } from "@nestjs/common";
import { SupabaseServiceClient } from "../supabase/supabase-service.client";

export type UserIdentityProfileRow = {
  user_id: string;
  legal_name: string;
  birth_date: string;
  phone_e164: string;
};

export type VerificationSessionRow = {
  id: string;
  user_id: string | null;
  purpose: string;
  provider: string;
  provider_session_id: string | null;
  status: string;
  phone_e164: string | null;
  metadata: Record<string, unknown>;
  attempt_count: number;
  expires_at: string;
  verified_at: string | null;
};

@Injectable()
export class AccountRecoveryRepository {
  private readonly logger = new Logger(AccountRecoveryRepository.name);

  constructor(private readonly serviceClient: SupabaseServiceClient) {}

  private admin() {
    const client = this.serviceClient.getOrNull();
    if (!client) {
      throw new Error("Service role client unavailable");
    }
    return client;
  }

  async findIdentityProfile(input: {
    legalName: string;
    birthDate: string;
    phoneE164: string;
  }): Promise<UserIdentityProfileRow | null> {
    const { data, error } = await this.admin()
      .from("user_identity_profiles")
      .select("user_id, legal_name, birth_date, phone_e164")
      .eq("legal_name", input.legalName.trim())
      .eq("birth_date", input.birthDate)
      .eq("phone_e164", input.phoneE164)
      .maybeSingle();

    if (error) {
      this.logger.warn(`identity profile lookup failed code=${error.code}`);
      return null;
    }
    return data as UserIdentityProfileRow | null;
  }

  async findIdentityProfileByUserId(userId: string): Promise<UserIdentityProfileRow | null> {
    const { data, error } = await this.admin()
      .from("user_identity_profiles")
      .select("user_id, legal_name, birth_date, phone_e164")
      .eq("user_id", userId)
      .maybeSingle();

    if (error) {
      this.logger.warn(`identity profile by user lookup failed code=${error.code}`);
      return null;
    }
    return data as UserIdentityProfileRow | null;
  }

  async insertIdentityProfile(row: {
    userId: string;
    legalName: string;
    birthDate: string;
    phoneE164: string;
    phoneVerifiedAt: string;
    termsAcceptedAt?: string | null;
    privacyAcceptedAt?: string | null;
  }): Promise<void> {
    const { error } = await this.admin().from("user_identity_profiles").insert({
      user_id: row.userId,
      legal_name: row.legalName,
      birth_date: row.birthDate,
      phone_e164: row.phoneE164,
      phone_verified_at: row.phoneVerifiedAt,
      terms_accepted_at: row.termsAcceptedAt ?? null,
      privacy_accepted_at: row.privacyAcceptedAt ?? null,
    });
    if (error) {
      throw new Error(`identity profile insert failed code=${error.code}`);
    }
  }

  async createVerificationSession(row: {
    id: string;
    userId: string | null;
    purpose: string;
    provider: string;
    providerSessionId: string;
    phoneE164: string;
    expiresAt: string;
    metadata?: Record<string, unknown>;
  }): Promise<void> {
    const { error } = await this.admin().from("identity_verification_sessions").insert({
      id: row.id,
      user_id: row.userId,
      purpose: row.purpose,
      provider: row.provider,
      provider_session_id: row.providerSessionId,
      status: "pending",
      phone_e164: row.phoneE164,
      expires_at: row.expiresAt,
      metadata: row.metadata ?? {},
    });
    if (error) {
      throw new Error(`verification session insert failed code=${error.code}`);
    }
  }

  async getVerificationSession(id: string): Promise<VerificationSessionRow | null> {
    const { data, error } = await this.admin()
      .from("identity_verification_sessions")
      .select("*")
      .eq("id", id)
      .maybeSingle();
    if (error) {
      this.logger.warn(`verification session select failed code=${error.code}`);
      return null;
    }
    return data as VerificationSessionRow | null;
  }

  async markVerificationVerified(id: string): Promise<void> {
    const { error } = await this.admin()
      .from("identity_verification_sessions")
      .update({
        status: "verified",
        verified_at: new Date().toISOString(),
      })
      .eq("id", id);
    if (error) {
      throw new Error(`verification session update failed code=${error.code}`);
    }
  }

  async createRecoveryToken(row: {
    id: string;
    userId: string;
    tokenHash: string;
    expiresAt: string;
  }): Promise<void> {
    const { error } = await this.admin().from("account_recovery_tokens").insert({
      id: row.id,
      user_id: row.userId,
      method: "phone",
      token_hash: row.tokenHash,
      expires_at: row.expiresAt,
    });
    if (error) {
      throw new Error(`recovery token insert failed code=${error.code}`);
    }
  }

  async getRecoveryTokenByHash(tokenHash: string): Promise<{
    id: string;
    user_id: string;
    expires_at: string;
    consumed_at: string | null;
  } | null> {
    const { data, error } = await this.admin()
      .from("account_recovery_tokens")
      .select("id, user_id, expires_at, consumed_at")
      .eq("token_hash", tokenHash)
      .maybeSingle();
    if (error) {
      this.logger.warn(`recovery token select failed code=${error.code}`);
      return null;
    }
    return data;
  }

  async consumeRecoveryToken(id: string): Promise<boolean> {
    const { data, error } = await this.admin()
      .from("account_recovery_tokens")
      .update({ consumed_at: new Date().toISOString() })
      .eq("id", id)
      .is("consumed_at", null)
      .select("id")
      .maybeSingle();
    if (error) {
      this.logger.warn(`recovery token consume failed code=${error.code}`);
      return false;
    }
    return Boolean(data);
  }

  async recordAttempt(row: {
    userId: string | null;
    method: string;
    result: string;
    ipHash: string | null;
    metadata?: Record<string, unknown>;
  }): Promise<void> {
    const { error } = await this.admin().from("account_recovery_attempts").insert({
      user_id: row.userId,
      method: row.method,
      result: row.result,
      ip_hash: row.ipHash,
      metadata: row.metadata ?? {},
    });
    if (error) {
      this.logger.warn(`recovery attempt insert failed code=${error.code}`);
    }
  }

  async writeAuditLog(row: {
    actorId: string | null;
    action: string;
    resourceId: string | null;
    metadata?: Record<string, unknown>;
  }): Promise<void> {
    const { error } = await this.admin().from("data_access_logs").insert({
      actor_id: row.actorId,
      actor_role: null,
      resource_type: "account_recovery",
      resource_id: row.resourceId,
      action: row.action,
      metadata: row.metadata ?? {},
    });
    if (error) {
      this.logger.warn(`audit log insert failed code=${error.code}`);
    }
  }

  async getUserEmail(userId: string): Promise<string | null> {
    const admin = this.serviceClient.getOrNull();
    if (!admin) return null;
    const result = await admin.auth.admin.getUserById(userId);
    if (result.error || !result.data.user) return null;
    return result.data.user.email ?? null;
  }
}
