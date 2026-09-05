import {
  BadRequestException,
  ForbiddenException,
  ServiceUnavailableException,
} from "@nestjs/common";
import { DeliveryManualInvoiceEvidenceService } from "./delivery-manual-invoice-evidence.service";
import type { DeliveriesRepository } from "./deliveries.repository";
import type { SupabaseServiceClient } from "../supabase/supabase-service.client";
import type { AccessScopeService } from "../access/access-scope.service";
import type { AuthUser } from "../auth/auth.types";
import { MAX_INVOICE_EVIDENCE_BYTES } from "./manual-invoice-evidence";

const DRIVER_A = "22222222-2222-4222-8222-222222222222";
const DRIVER_B = "33333333-3333-4333-8333-333333333333";
const POINT_ID = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const JOB_ID = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";

function jpegBytes(): Buffer {
  const app1 = Buffer.from([
    0xff, 0xe1, 0x00, 0x10, 0x45, 0x78, 0x69, 0x66, 0x00, 0x00, 0x00, 0x00,
    0x00, 0x00, 0x00, 0x00, 0x00, 0x00,
  ]);
  const rest = Buffer.from([
    0xff, 0xda, 0x00, 0x08, 0x01, 0x01, 0x00, 0x00, 0x3f, 0x00, 0xff, 0xd9,
  ]);
  return Buffer.concat([Buffer.from([0xff, 0xd8]), app1, rest]);
}

function driverUser(driverId: string): AuthUser {
  return {
    userId: "user-1",
    role: "driver",
    companyId: null,
    driverId,
    accessToken: "t",
  };
}

describe("DeliveryManualInvoiceEvidenceService", () => {
  function setup(opts?: {
    pointDriverId?: string;
    existingPath?: string | null;
    uploadError?: boolean;
    attachOk?: boolean;
    signedUrl?: string | null;
  }) {
    const pointDriverId = opts?.pointDriverId ?? DRIVER_A;
    const findPointForDriver = jest.fn().mockImplementation(
      async (_c: unknown, driverId: string) => {
        if (driverId !== pointDriverId) return null;
        return { id: POINT_ID, job_id: JOB_ID, driver_id: pointDriverId };
      },
    );
    const findPointById = jest.fn().mockResolvedValue({
      id: POINT_ID,
      job_id: JOB_ID,
      driver_id: pointDriverId,
    });
    const findJobById = jest.fn().mockResolvedValue({
      id: JOB_ID,
      driver_id: pointDriverId,
      company_id: "comp-1",
    });
    const findManualRegistration = jest.fn().mockResolvedValue(
      opts?.existingPath
        ? {
            pointId: POINT_ID,
            driverId: pointDriverId,
            registrationMethod: "manual",
            manualReason: "barcode_scan_failed",
            evidenceType: "manual_invoice_scan_failure",
            storagePath: opts.existingPath,
          }
        : {
            pointId: POINT_ID,
            driverId: pointDriverId,
            registrationMethod: "manual",
            manualReason: "barcode_scan_failed",
            evidenceType: null,
            storagePath: null,
          },
    );
    const attachManualInvoiceEvidence = jest
      .fn()
      .mockResolvedValue(opts?.attachOk !== false);
    const upload = jest.fn().mockResolvedValue({
      error: opts?.uploadError ? { message: "fail" } : null,
    });
    const remove = jest.fn().mockResolvedValue({ error: null });
    const createSignedUrl = jest.fn().mockResolvedValue({
      data: opts?.signedUrl === null ? null : { signedUrl: opts?.signedUrl ?? "https://signed.example/x" },
      error: opts?.signedUrl === null ? { message: "fail" } : null,
    });
    const admin = {
      storage: {
        from: () => ({ upload, remove, createSignedUrl }),
      },
    };
    const scope = {
      forUser: (user: AuthUser) => ({
        requireDriverId: () => {
          if (!user.driverId) throw new Error("no driver");
          return user.driverId;
        },
        assertCanAccessDriverResource: (args: { driverId: string }) => {
          if (user.role === "driver" && user.driverId !== args.driverId) {
            throw new ForbiddenException("Driver scope denied");
          }
        },
      }),
    };

    const svc = new DeliveryManualInvoiceEvidenceService(
      {
        findPointForDriver,
        findPointById,
        findJobById,
        findManualRegistration,
        attachManualInvoiceEvidence,
      } as unknown as DeliveriesRepository,
      { getOrNull: () => admin } as unknown as SupabaseServiceClient,
      scope as unknown as AccessScopeService,
    );
    return {
      svc,
      upload,
      createSignedUrl,
      attachManualInvoiceEvidence,
      userClient: {} as never,
    };
  }

  it("uploads after ownership check and does not return a public URL", async () => {
    const { svc, upload, attachManualInvoiceEvidence, userClient } = setup();
    const out = await svc.upload(userClient, {
      user: driverUser(DRIVER_A),
      pointId: POINT_ID,
      body: {
        contentType: "image/jpeg",
        bytesBase64: jpegBytes().toString("base64"),
        manualReason: "barcode_scan_failed",
      },
    });
    expect(out.ok).toBe(true);
    expect(out.evidenceStatus).toBe("uploaded");
    expect(out.evidenceType).toBe("manual_invoice_scan_failure");
    expect(upload).toHaveBeenCalledTimes(1);
    const [path, bytes, opts] = upload.mock.calls[0];
    expect(String(path)).toContain("/manual-invoice/");
    expect(String(path)).toContain(DRIVER_A);
    expect(String(path)).not.toMatch(/\/\d+\.jpg$/);
    expect(Buffer.isBuffer(bytes)).toBe(true);
    expect(opts.contentType).toBe("image/jpeg");
    expect(attachManualInvoiceEvidence).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        pointId: POINT_ID,
        driverId: DRIVER_A,
        manualReason: "barcode_scan_failed",
      }),
    );
    expect(JSON.stringify(out)).not.toContain("getPublicUrl");
    expect(JSON.stringify(out)).not.toContain("/storage/v1/object/public/");
  });

  it("blocks another driver from uploading or reading", async () => {
    const { svc, userClient } = setup({ pointDriverId: DRIVER_A });
    await expect(
      svc.upload(userClient, {
        user: driverUser(DRIVER_B),
        pointId: POINT_ID,
        body: {
          contentType: "image/jpeg",
          bytesBase64: jpegBytes().toString("base64"),
        },
      }),
    ).rejects.toBeInstanceOf(ForbiddenException);

    await expect(
      svc.readSigned(userClient, {
        user: driverUser(DRIVER_B),
        pointId: POINT_ID,
      }),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it("rejects invalid MIME and oversized payloads", async () => {
    const { svc, userClient } = setup();
    await expect(
      svc.upload(userClient, {
        user: driverUser(DRIVER_A),
        pointId: POINT_ID,
        body: { contentType: "image/jpeg", bytesBase64: "bm90LWltYWdl" },
      }),
    ).rejects.toBeInstanceOf(BadRequestException);

    const huge = Buffer.concat([
      Buffer.from([0xff, 0xd8, 0xff, 0xda]),
      Buffer.alloc(MAX_INVOICE_EVIDENCE_BYTES),
    ]);
    await expect(
      svc.upload(userClient, {
        user: driverUser(DRIVER_A),
        pointId: POINT_ID,
        body: {
          contentType: "image/jpeg",
          bytesBase64: huge.toString("base64"),
        },
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it("maps storage upload failure without failing the already-created point", async () => {
    const { svc, userClient } = setup({ uploadError: true });
    await expect(
      svc.upload(userClient, {
        user: driverUser(DRIVER_A),
        pointId: POINT_ID,
        body: {
          contentType: "image/jpeg",
          bytesBase64: jpegBytes().toString("base64"),
        },
      }),
    ).rejects.toBeInstanceOf(ServiceUnavailableException);
  });

  it("issues a signed read URL only", async () => {
    const { svc, createSignedUrl, userClient } = setup({
      existingPath: `${DRIVER_A}/${POINT_ID}/manual-invoice/x.jpg`,
    });
    const out = await svc.readSigned(userClient, {
      user: driverUser(DRIVER_A),
      pointId: POINT_ID,
    });
    expect(createSignedUrl).toHaveBeenCalled();
    expect(out.signedUrl).toContain("https://signed.example");
    expect(out.hasEvidence).toBe(true);
    expect(JSON.stringify(out)).not.toContain("/object/public/");
  });
});
