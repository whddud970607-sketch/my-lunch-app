import type { ImportCommitResult } from "./import-commit.types";

const FORBIDDEN_RESPONSE_KEYS = new Set([
  "pointIds",
  "shipmentIds",
  "trackingCode",
  "externalId",
  "rawAddress",
  "address",
  "customerName",
  "detailAddress",
  "deliveryMemo",
  "phone",
]);

export function mapCommitRpcResult(raw: unknown): ImportCommitResult {
  const row = (raw ?? {}) as Record<string, unknown>;
  const result: ImportCommitResult = {
    ok: row.ok === true,
    resultCode:
      row.resultCode === "applied" ||
      row.resultCode === "duplicate" ||
      row.resultCode === "rejected"
        ? row.resultCode
        : "rejected",
  };

  if (typeof row.batchId === "string") result.batchId = row.batchId;
  if (typeof row.jobId === "string") result.jobId = row.jobId;
  if (typeof row.rowCount === "number") result.rowCount = row.rowCount;
  if (typeof row.code === "string") result.code = row.code;
  if (row.rowIndex === null) result.rowIndex = null;
  else if (typeof row.rowIndex === "number") result.rowIndex = row.rowIndex;

  return result;
}

export function assertSafeCommitResponse(result: ImportCommitResult): void {
  for (const key of Object.keys(result as object)) {
    if (FORBIDDEN_RESPONSE_KEYS.has(key)) {
      throw new Error(`unsafe_commit_response_field:${key}`);
    }
  }
}

export function toPublicCommitResponse(
  result: ImportCommitResult,
): ImportCommitResult {
  assertSafeCommitResponse(result);
  return {
    ok: result.ok,
    resultCode: result.resultCode,
    ...(result.batchId ? { batchId: result.batchId } : {}),
    ...(result.rowCount != null ? { rowCount: result.rowCount } : {}),
    ...(result.jobId ? { jobId: result.jobId } : {}),
    ...(result.code ? { code: result.code } : {}),
    ...(result.rowIndex !== undefined ? { rowIndex: result.rowIndex ?? null } : {}),
  };
}

export function sanitizeCommitLogMeta(result: ImportCommitResult): Record<string, unknown> {
  return {
    ok: result.ok,
    resultCode: result.resultCode,
    code: result.code ?? null,
    rowIndex: result.rowIndex ?? null,
    rowCount: result.rowCount ?? null,
    hasBatchId: Boolean(result.batchId),
  };
}
