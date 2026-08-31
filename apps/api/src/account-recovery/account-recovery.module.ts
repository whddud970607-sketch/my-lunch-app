import { Module } from "@nestjs/common";
import { SupabaseModule } from "../supabase/supabase.module";
import { IdentityVerificationModule } from "../identity/identity-verification.module";
import { AccountRecoveryController } from "./account-recovery.controller";
import { AccountRecoveryService } from "./account-recovery.service";
import { RecoveryRateLimitService } from "./recovery-rate-limit.service";
import { RecoveryTokenService } from "./recovery-token.service";

@Module({
  imports: [SupabaseModule, IdentityVerificationModule],
  controllers: [AccountRecoveryController],
  providers: [
    AccountRecoveryService,
    RecoveryRateLimitService,
    RecoveryTokenService,
  ],
})
export class AccountRecoveryModule {}
