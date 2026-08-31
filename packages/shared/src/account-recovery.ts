export type IdentityVerificationPurpose =
  | "signup"
  | "find_email"
  | "reset_password"
  | "admin_support";

export type IdentityVerificationStatus =
  | "pending"
  | "verified"
  | "failed"
  | "expired";

export type AccountRecoveryMethod = "phone" | "driver_license" | "admin";

export type AccountStatus = "active" | "locked" | "recovery_pending";
