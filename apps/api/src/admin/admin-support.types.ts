export type AdminSupportUserSummary = {
  userId: string;
  role: string;
  accountStatus: string;
  maskedEmail: string;
  maskedPhone: string;
  phoneVerified: boolean;
  licenseVerified: boolean;
  accountLocked: boolean;
  lastRecoveryAttemptAt: string | null;
  availableRecoveryMethods: Array<"phone" | "driver_license" | "admin_grant">;
};

export type AdminSupportSearchResult = {
  users: AdminSupportUserSummary[];
  meta: {
    queryApplied: boolean;
    resultCount: number;
  };
};

export type AdminRecoveryGrantResult = {
  grantId: string | null;
  expiresAt: string | null;
  message: string;
};
