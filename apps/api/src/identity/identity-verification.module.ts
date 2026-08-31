import { Module } from "@nestjs/common";
import { SupabaseModule } from "../supabase/supabase.module";
import { AccountRecoveryRepository } from "../account-recovery/account-recovery.repository";
import { IdentityProviderConfigService } from "./identity-provider-config.service";
import { IdentityVerificationService } from "./identity-verification.service";
import { IDENTITY_VERIFICATION_PROVIDER } from "./identity-verification.provider";
import { StubIdentityVerificationProvider } from "./providers/stub-identity.provider";
import { UserIdentityProfilesService } from "./user-identity-profiles.service";

@Module({
  imports: [SupabaseModule],
  providers: [
    AccountRecoveryRepository,
    IdentityProviderConfigService,
    IdentityVerificationService,
    UserIdentityProfilesService,
    StubIdentityVerificationProvider,
    {
      provide: IDENTITY_VERIFICATION_PROVIDER,
      useExisting: StubIdentityVerificationProvider,
    },
  ],
  exports: [
    IdentityVerificationService,
    IdentityProviderConfigService,
    UserIdentityProfilesService,
    AccountRecoveryRepository,
  ],
})
export class IdentityVerificationModule {}
