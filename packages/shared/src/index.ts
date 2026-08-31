/** Shared domain types for Delivery Shield */

export type {
  AccountRecoveryMethod,
  AccountStatus,
  IdentityVerificationPurpose,
  IdentityVerificationStatus,
} from "./account-recovery";

export type UserRole = "driver" | "company_admin" | "platform_admin";

export type PinAccuracy =
  | "address"
  | "building"
  | "entrance"
  | "driver_verified";

export type DeliveryPointStatus =
  | "pending"
  | "in_progress"
  | "completed"
  | "failed";

export type JobStatus = "draft" | "active" | "done";

/** Carrier masked/virtual contact — never a dedicated raw customer MSISDN store */
export type DeliveryContactType = "none" | "masked_number" | "virtual_number";

export type {
  DeliverySessionStatus,
  DeliverySessionSummarySnapshot,
  DeliveryRoutePointDto,
} from "./delivery-session";
