import type { ImportSourceFormat, NormalizedDeliveryDraft } from "./import.types";

export type ImportCommitResultCode = "applied" | "duplicate" | "rejected";

export type ImportCommitResult = {
  ok: boolean;
  resultCode: ImportCommitResultCode;
  batchId?: string;
  rowCount?: number;
  jobId?: string;
  code?: string;
  rowIndex?: number | null;
};

export type ImportCommitRequest = {
  commitIdempotencyKey: string;
  sourceId: string;
  format: ImportSourceFormat;
  serviceDate: string;
  drafts: NormalizedDeliveryDraft[];
  /** Ignored if present — JWT is authoritative. */
  claimedDriverId?: string | null;
  claimedCompanyId?: string | null;
};

export type ImportCommitRpcRow = {
  rowIndex: number;
  trackingCode: string;
  externalId: string | null;
  quantity: number;
  displayLabel: string | null;
  customerName: string | null;
  rawAddress: string | null;
  detailAddress: string | null;
  deliveryMemo: string | null;
};

export const IMPORT_RESOLUTION_INITIAL_STATE = {
  location: null,
  pinAccuracy: "address",
  resolutionStatus: "pending",
  resolutionStage: "pending",
  resolutionVersion: 1,
} as const;
