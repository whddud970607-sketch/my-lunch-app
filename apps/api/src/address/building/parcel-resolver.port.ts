import type { ParcelIdentity } from "./building-resolution.types";

export const ParcelResolverStatus = {
  RESOLVED: "RESOLVED",
  UNRESOLVED: "UNRESOLVED",
  AMBIGUOUS: "AMBIGUOUS",
  PROVIDER_ERROR: "PROVIDER_ERROR",
  BLOCKED: "BLOCKED",
} as const;

export type ParcelResolverStatusType =
  (typeof ParcelResolverStatus)[keyof typeof ParcelResolverStatus];

export type ParcelResolverResult = {
  status: ParcelResolverStatusType;
  parcel: ParcelIdentity | null;
  reason: string | null;
  provenance: string | null;
};

export interface ParcelResolver {
  readonly id: string;
  resolve(roadAddress: string): Promise<ParcelResolverResult>;
}
