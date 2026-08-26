/** Shared domain enums / DTO stubs — expand in Phase 1+ */

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
