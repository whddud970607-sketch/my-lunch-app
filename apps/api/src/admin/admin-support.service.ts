import { Injectable } from "@nestjs/common";
import type {
  AdminRecoveryGrantResult,
  AdminSupportSearchResult,
} from "./admin-support.types";

@Injectable()
export class AdminSupportService {
  /**
   * Phase F skeleton — platform_admin search across masked identity fields.
   * Never returns or accepts passwords.
   */
  searchUsers(_query: {
    legalName?: string;
    birthDate?: string;
    phoneFragment?: string;
    emailFragment?: string;
  }): AdminSupportSearchResult {
    return {
      users: [],
      meta: {
        queryApplied: false,
        resultCount: 0,
      },
    };
  }

  /**
   * Phase F — issue a recovery grant so the user sets their own password in-app.
   * Admin never sees or sets password plaintext.
   */
  grantRecoveryAccess(_input: {
    userId: string;
    method: "admin_grant";
    reason: string;
  }): AdminRecoveryGrantResult {
    return {
      grantId: null,
      expiresAt: null,
      message:
        "Recovery grant skeleton — Phase F will issue a single-use recovery token only.",
    };
  }
}
