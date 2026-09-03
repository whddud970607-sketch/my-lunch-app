import {
  BadRequestException,
  ForbiddenException,
} from "@nestjs/common";
import type { SupabaseClient } from "@supabase/supabase-js";
import { ImportValidationEngine } from "./import-validation.engine";
import { SupabaseImportContextAuthority } from "./supabase-import-context.authority";
import type { ImportContextResolution } from "./import-context.port";
import { ImportCommitRepository } from "./import-commit.repository";
import { ImportCommitService } from "./import-commit.service";
import {
  assertSafeCommitResponse,
  mapCommitRpcResult,
  sanitizeCommitLogMeta,
  toPublicCommitResponse,
} from "./import-commit.response";
import { draftsToCommitRpcRows } from "./import-commit.mapper";
import { IMPORT_RESOLUTION_INITIAL_STATE } from "./import-commit.types";
import type { NormalizedDeliveryDraft } from "./import.types";
import { redactCredentials, assertNoSensitiveLeak } from "../address/building/diagnostic-redaction";

const SOURCE_ID = "11111111-1111-4111-8111-111111111111";
const DRIVER_ID = "22222222-2222-4222-8222-222222222222";
const OTHER_DRIVER = "33333333-3333-4333-8333-333333333333";

function draft(rowIndex: number, tracking: string): NormalizedDeliveryDraft {
  return {
    rowIndex,
    companyId: "c1",
    sourceId: SOURCE_ID,
    sourceKey: null,
    serviceDate: "2026-09-02",
    trackingCode: tracking,
    externalId: null,
    quantity: 1,
    quantityOrigin: "explicit",
    customerName: "홍길동",
    addressRaw: "인천광역시 남동구 테스트로 1",
    addressNormalized: null,
    detailAddress: "101동 503호",
    complexName: null,
    deliveryMemo: "문 앞",
    displayLabel: "배송지",
    barcodeRaw: null,
    latitude: null,
    longitude: null,
    geocodeConfidence: null,
    geocodeProvider: null,
    geocodeStatus: "pending",
    issues: [],
  };
}

function setupAuthority(
  resolution: ImportContextResolution,
): SupabaseImportContextAuthority {
  return {
    resolve: jest.fn().mockResolvedValue(resolution),
  } as unknown as SupabaseImportContextAuthority;
}

function resolvedContext(active = true): ImportContextResolution {
  if (!active) {
    return { status: "source_not_allowed" };
  }
  return {
    status: "resolved",
    source: {
      id: SOURCE_ID,
      companyId: "company-1",
      ownerDriverId: null,
      sourceType: "csv_import",
      sourceKey: "test-source",
      isActive: active,
    },
    namespaceKey: `source:${SOURCE_ID}`,
  };
}

describe("ImportCommitService", () => {
  const userClient = {} as SupabaseClient;
  let rpcMock: jest.Mock;
  let service: ImportCommitService;

  beforeEach(() => {
    rpcMock = jest.fn();
    const repo = {
      rpcCommitImportBatch: rpcMock,
    } as unknown as ImportCommitRepository;
    const authority = setupAuthority(resolvedContext());
    service = new ImportCommitService(repo, authority);
  });

  it("commits with C2 recheck and returns safe response", async () => {
    rpcMock.mockResolvedValue(
      mapCommitRpcResult({
        ok: true,
        resultCode: "applied",
        batchId: "batch-1",
        rowCount: 1,
        jobId: "job-1",
      }),
    );

    const result = await service.commit(
      userClient,
      { driverId: DRIVER_ID, companyIds: ["company-1"] },
      {
        commitIdempotencyKey: "key-1",
        sourceId: SOURCE_ID,
        format: "csv",
        serviceDate: "2026-09-02",
        drafts: [draft(0, "TRK001")],
      },
    );

    expect(result.ok).toBe(true);
    expect(result.resultCode).toBe("applied");
    expect(result.batchId).toBe("batch-1");
    expect(result.rowCount).toBe(1);
    expect(result.jobId).toBe("job-1");
    expect((result as Record<string, unknown>).pointIds).toBeUndefined();
    expect(rpcMock).toHaveBeenCalledTimes(1);
  });

  it("duplicate idempotent replay returns duplicate without re-insert", async () => {
    rpcMock.mockResolvedValue(
      mapCommitRpcResult({
        ok: true,
        resultCode: "duplicate",
        batchId: "batch-1",
        rowCount: 2,
        jobId: "job-1",
      }),
    );

    const result = await service.commit(
      userClient,
      { driverId: DRIVER_ID, companyIds: ["company-1"] },
      {
        commitIdempotencyKey: "key-dup",
        sourceId: SOURCE_ID,
        format: "csv",
        serviceDate: "2026-09-02",
        drafts: [draft(0, "A"), draft(1, "B")],
      },
    );

    expect(result.resultCode).toBe("duplicate");
    expect(rpcMock).toHaveBeenCalledTimes(1);
  });

  it("rejects idempotency_context_mismatch from RPC", async () => {
    rpcMock.mockResolvedValue(
      mapCommitRpcResult({
        ok: false,
        resultCode: "rejected",
        code: "idempotency_context_mismatch",
      }),
    );

    const result = await service.commit(
      userClient,
      { driverId: DRIVER_ID, companyIds: ["company-1"] },
      {
        commitIdempotencyKey: "key-x",
        sourceId: SOURCE_ID,
        format: "csv",
        serviceDate: "2026-09-02",
        drafts: [draft(0, "TRK001")],
      },
    );

    expect(result.code).toBe("idempotency_context_mismatch");
  });

  it("rejects idempotency_payload_mismatch (row_count)", async () => {
    rpcMock.mockResolvedValue(
      mapCommitRpcResult({
        ok: false,
        resultCode: "rejected",
        code: "idempotency_payload_mismatch",
      }),
    );

    const result = await service.commit(
      userClient,
      { driverId: DRIVER_ID, companyIds: ["company-1"] },
      {
        commitIdempotencyKey: "key-x",
        sourceId: SOURCE_ID,
        format: "csv",
        serviceDate: "2026-09-02",
        drafts: [draft(0, "TRK001"), draft(1, "TRK002")],
      },
    );

    expect(result.code).toBe("idempotency_payload_mismatch");
  });

  it("duplicate shipment identifier returns sanitized rowIndex", async () => {
    rpcMock.mockResolvedValue(
      mapCommitRpcResult({
        ok: false,
        resultCode: "rejected",
        code: "duplicate_shipment_identifier",
        rowIndex: 3,
      }),
    );

    const result = await service.commit(
      userClient,
      { driverId: DRIVER_ID, companyIds: ["company-1"] },
      {
        commitIdempotencyKey: "key-ship-dup",
        sourceId: SOURCE_ID,
        format: "csv",
        serviceDate: "2026-09-02",
        drafts: [draft(3, "DUP-TRACK")],
      },
    );

    expect(result.code).toBe("duplicate_shipment_identifier");
    expect(result.rowIndex).toBe(3);
    expect(JSON.stringify(result)).not.toContain("DUP-TRACK");
  });

  it("rejects client claimedDriverId mismatch", async () => {
    await expect(
      service.commit(
        userClient,
        { driverId: DRIVER_ID, companyIds: ["company-1"] },
        {
          commitIdempotencyKey: "key-1",
          sourceId: SOURCE_ID,
          format: "csv",
          serviceDate: "2026-09-02",
          drafts: [draft(0, "TRK001")],
          claimedDriverId: OTHER_DRIVER,
        },
      ),
    ).rejects.toBeInstanceOf(ForbiddenException);
    expect(rpcMock).not.toHaveBeenCalled();
  });

  it("rejects inactive source via C2 recheck", async () => {
    const repo = { rpcCommitImportBatch: rpcMock } as unknown as ImportCommitRepository;
    const authority = setupAuthority(resolvedContext(false));
    const inactiveService = new ImportCommitService(repo, authority);

    await expect(
      inactiveService.commit(
        userClient,
        { driverId: DRIVER_ID, companyIds: ["company-1"] },
        {
          commitIdempotencyKey: "key-1",
          sourceId: SOURCE_ID,
          format: "csv",
          serviceDate: "2026-09-02",
          drafts: [draft(0, "TRK001")],
        },
      ),
    ).rejects.toBeInstanceOf(ForbiddenException);
    expect(rpcMock).not.toHaveBeenCalled();
  });

  it("rejects cross-tenant source (company not in actor list)", async () => {
    const repo = { rpcCommitImportBatch: rpcMock } as unknown as ImportCommitRepository;
    const authority = setupAuthority({ status: "source_not_allowed" });
    const svc = new ImportCommitService(repo, authority);

    await expect(
      svc.commit(
        userClient,
        { driverId: DRIVER_ID, companyIds: ["other-company"] },
        {
          commitIdempotencyKey: "key-1",
          sourceId: SOURCE_ID,
          format: "csv",
          serviceDate: "2026-09-02",
          drafts: [draft(0, "TRK001")],
        },
      ),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it("blocks commit when C2 validation fails", async () => {
    const bad = draft(0, "");
    bad.trackingCode = "";

    await expect(
      service.commit(
        userClient,
        { driverId: DRIVER_ID, companyIds: ["company-1"] },
        {
          commitIdempotencyKey: "key-1",
          sourceId: SOURCE_ID,
          format: "csv",
          serviceDate: "2026-09-02",
          drafts: [bad],
        },
      ),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(rpcMock).not.toHaveBeenCalled();
  });

  it("does not call AddressResolutionService (no provider calls)", async () => {
    rpcMock.mockResolvedValue(
      mapCommitRpcResult({ ok: true, resultCode: "applied", batchId: "b", rowCount: 1 }),
    );
    await service.commit(
      userClient,
      { driverId: DRIVER_ID, companyIds: ["company-1"] },
      {
        commitIdempotencyKey: "key-1",
        sourceId: SOURCE_ID,
        format: "csv",
        serviceDate: "2026-09-02",
        drafts: [draft(0, "TRK001")],
      },
    );
    expect(rpcMock).toHaveBeenCalledTimes(1);
  });
});

describe("import commit response safety", () => {
  it("sanitized log meta contains no PII", () => {
    const meta = sanitizeCommitLogMeta({
      ok: false,
      resultCode: "rejected",
      code: "duplicate_shipment_identifier",
      rowIndex: 2,
      batchId: "uuid",
    });
    const serialized = JSON.stringify(meta);
    expect(serialized).not.toMatch(/홍길동|503호|TRK|인천/);
    expect(assertNoSensitiveLeak(serialized)).toBe(true);
  });

  it("public response strips forbidden giant arrays", () => {
    const safe = toPublicCommitResponse({
      ok: true,
      resultCode: "applied",
      batchId: "b1",
      rowCount: 5,
    });
    assertSafeCommitResponse(safe);
    expect(Object.keys(safe)).not.toContain("pointIds");
  });

  it("credential redaction in error paths", () => {
    const err = redactCredentials(
      "failed serviceKey=SECRET123 KakaoAK abcdef token",
    );
    expect(err).not.toContain("SECRET123");
    expect(assertNoSensitiveLeak(err)).toBe(true);
  });
});

describe("resolution initial state contract", () => {
  it("documents pending resolution defaults for RPC insert", () => {
    expect(IMPORT_RESOLUTION_INITIAL_STATE.resolutionStatus).toBe("pending");
    expect(IMPORT_RESOLUTION_INITIAL_STATE.resolutionStage).toBe("pending");
    expect(IMPORT_RESOLUTION_INITIAL_STATE.pinAccuracy).toBe("address");
    expect(IMPORT_RESOLUTION_INITIAL_STATE.location).toBeNull();
  });
});

describe("import-commit.mapper", () => {
  it("maps drafts to RPC rows without dropping row index", () => {
    const rows = draftsToCommitRpcRows([draft(7, "T7")]);
    expect(rows[0].rowIndex).toBe(7);
    expect(rows[0].trackingCode).toBe("T7");
  });
});

describe("migration static contract", () => {
  const fs = require("node:fs") as typeof import("node:fs");
  const path = require("node:path") as typeof import("node:path");

  it("RPC draft enforces resolution pending and no fingerprint", () => {
    const sql = fs.readFileSync(
      path.join(
        __dirname,
        "../../../../supabase/migrations/024_delivery_point_resolution_and_import_foundation.sql",
      ),
      "utf8",
    );
    expect(sql).toContain("commit_import_batch_atomic");
    expect(sql).toContain("'pending'");
    expect(sql).not.toContain("draft_fingerprint");
    expect(sql).not.toContain("pointIds");
  });
});
