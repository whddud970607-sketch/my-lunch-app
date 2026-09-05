import { BadRequestException } from "@nestjs/common";
import {
  DeliveryManualRegisterService,
  composeManualDongHoDetail,
  resolveManualRawAddress,
  sanitizeRecipientName,
  sanitizeRecipientPhone,
} from "./delivery-manual-register.service";
import { manualTrackingFromIdempotencyKey } from "./delivery-manual-identifier";
import type { ImportCommitService } from "../import/import-commit.service";
import type { DeliverySourceRepository } from "../import/delivery-source.repository";
import type { SupabaseServiceClient } from "../supabase/supabase-service.client";
import type { DeliveriesRepository } from "./deliveries.repository";
import type { AddressResolutionService } from "../address/address-resolution.service";

const DRIVER_ID = "22222222-2222-4222-8222-222222222222";
const SOURCE_ID = "11111111-1111-4111-8111-111111111111";
const JOB_ID = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const POINT_ID = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const KEY = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";

describe("manual identifier + address compose", () => {
  it("derives deterministic dsman_ tracking from idempotency key", () => {
    const a = manualTrackingFromIdempotencyKey(KEY);
    const b = manualTrackingFromIdempotencyKey(` ${KEY} `);
    expect(a).toBe(b);
    expect(a.startsWith("dsman_")).toBe(true);
    expect(a).not.toMatch(/^[0-9]{10,13}$/);
  });

  it("prefers road address and composes dong/ho/detail", () => {
    expect(
      resolveManualRawAddress({
        roadAddress: "도로 1",
        jibunAddress: "지번 1",
      }),
    ).toBe("도로 1");
    expect(
      composeManualDongHoDetail({
        dong: "504",
        unit: "2003",
        detailAddress: "경비실",
      }),
    ).toBe("504동 2003호 경비실");
    expect(
      composeManualDongHoDetail({
        dong: "101",
        unit: "1203",
        detailAddress: "",
      }),
    ).toBe("101동 1203호");
    expect(
      composeManualDongHoDetail({
        dong: "101동",
        unit: "1203호",
        detailAddress: "",
      }),
    ).toBe("101동 1203호");
    expect(
      composeManualDongHoDetail({
        dong: "101",
        unit: "1203",
        detailAddress: "101동 1203호",
      }),
    ).toBe("101동 1203호");
    expect(
      composeManualDongHoDetail({
        dong: " 101 ",
        unit: " 1203 ",
        detailAddress: "   ",
      }),
    ).toBe("101동 1203호");
  });

  it("sanitizes recipient name and phone without inventing values", () => {
    expect(sanitizeRecipientName(" 홍길동 ")).toBe("홍길동");
    expect(sanitizeRecipientName("")).toBeNull();
    expect(sanitizeRecipientPhone("010-1234-5678")).toBe("01012345678");
    expect(sanitizeRecipientPhone("12")).toBeNull();
  });
});

describe("DeliveryManualRegisterService", () => {
  function setup(opts?: {
    existingSource?: boolean;
    commitResult?: {
      ok: boolean;
      resultCode: "applied" | "duplicate" | "rejected";
      jobId?: string;
      code?: string;
    };
  }) {
    const findBySourceKey = jest.fn().mockResolvedValue(
      opts?.existingSource === false
        ? []
        : [
            {
              id: SOURCE_ID,
              companyId: null,
              ownerDriverId: DRIVER_ID,
              sourceType: "driver_manual",
              sourceKey: "driver-manual",
              isActive: true,
            },
          ],
    );
    const commit = jest.fn().mockResolvedValue(
      opts?.commitResult ?? {
        ok: true,
        resultCode: "applied",
        jobId: JOB_ID,
      },
    );
    const insert = jest.fn().mockReturnValue({
      select: () => ({
        maybeSingle: async () => ({ data: { id: SOURCE_ID }, error: null }),
      }),
    });
    const applyManualSearchLocation = jest.fn().mockResolvedValue(true);
    const applyManualRecipientContact = jest.fn().mockResolvedValue(true);
    const upsertManualRegistration = jest.fn().mockResolvedValue(true);
    const lookupApartmentDongCoords = jest.fn().mockResolvedValue(null);
    const admin = {
      from: jest.fn((table: string) => {
        if (table === "delivery_sources") {
          return { insert };
        }
        return {};
      }),
    };
    const svc = new DeliveryManualRegisterService(
      { findBySourceKey } as unknown as DeliverySourceRepository,
      { commit } as unknown as ImportCommitService,
      {
        getOrNull: () => admin,
      } as unknown as SupabaseServiceClient,
      {
        findFirstPointIdForJob: jest.fn().mockResolvedValue(POINT_ID),
        applyManualSearchLocation,
        applyManualRecipientContact,
        upsertManualRegistration,
      } as unknown as DeliveriesRepository,
      {
        lookupApartmentDongCoords,
      } as unknown as AddressResolutionService,
    );
    return {
      svc,
      commit,
      findBySourceKey,
      insert,
      applyManualSearchLocation,
      applyManualRecipientContact,
      upsertManualRegistration,
      lookupApartmentDongCoords,
    };
  }

  const body = {
    commitIdempotencyKey: KEY,
    serviceDate: "2026-09-04",
    roadAddress: "인천광역시 남동구 서창남순환로 55",
    buildingName: "에코에비뉴",
    dong: "504",
    unit: "2003",
    quantity: 1,
  };

  it("ensures source then commits one manual draft", async () => {
    const { svc, commit } = setup();
    const userClient = { from: jest.fn() } as never;
    const out = await svc.register(userClient, {
      driverId: DRIVER_ID,
      companyIds: [],
      body,
    });
    expect(out.ok).toBe(true);
    expect(out.pointId).toBe(POINT_ID);
    expect(out.jobId).toBe(JOB_ID);
    expect(out.registrationMethod).toBe("manual");
    expect(out.manualReason).toBe("manual_entry");
    expect(out.evidenceStatus).toBe("none");
    expect(commit).toHaveBeenCalledTimes(1);
    const req = commit.mock.calls[0][2];
    expect(req.format).toBe("manual");
    expect(req.sourceId).toBe(SOURCE_ID);
    expect(req.commitIdempotencyKey).toBe(KEY);
    expect(req.drafts).toHaveLength(1);
    expect(req.drafts[0].trackingCode).toBe(
      manualTrackingFromIdempotencyKey(KEY),
    );
    expect(req.drafts[0].addressRaw).toContain("서창남순환로");
    expect(req.drafts[0].addressRaw).not.toContain("504");
    expect(req.drafts[0].addressRaw).not.toContain("2003");
    expect(req.claimedDriverId).toBeUndefined();
  });

  it("prefers pin-adjusted coords and skips dong lookup", async () => {
    const { svc, applyManualSearchLocation, lookupApartmentDongCoords } =
      setup();
    await svc.register({} as never, {
      driverId: DRIVER_ID,
      companyIds: [],
      body: {
        ...body,
        latitude: 37.11,
        longitude: 126.11,
        pinAdjusted: true,
      },
    });
    expect(lookupApartmentDongCoords).not.toHaveBeenCalled();
    expect(applyManualSearchLocation).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        latitude: 37.11,
        longitude: 126.11,
        driverAdjusted: true,
      }),
    );
  });

  it("uses apartment dong coords when provider returns them", async () => {
    const { svc, applyManualSearchLocation, lookupApartmentDongCoords } =
      setup();
    lookupApartmentDongCoords.mockResolvedValue({
      latitude: 37.22,
      longitude: 126.22,
    });
    await svc.register({} as never, {
      driverId: DRIVER_ID,
      companyIds: [],
      body: {
        ...body,
        latitude: 37.42,
        longitude: 126.74,
      },
    });
    expect(lookupApartmentDongCoords).toHaveBeenCalled();
    expect(applyManualSearchLocation).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        latitude: 37.22,
        longitude: 126.22,
        driverAdjusted: false,
      }),
    );
  });

  it("stores barcode_scan_failed separately from manual_entry", async () => {
    const { svc, upsertManualRegistration } = setup();
    const failed = await svc.register({} as never, {
      driverId: DRIVER_ID,
      companyIds: [],
      body: {
        ...body,
        manualReason: "barcode_scan_failed",
        registrationMethod: "manual",
      },
    });
    expect(failed.manualReason).toBe("barcode_scan_failed");
    expect(upsertManualRegistration).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        pointId: POINT_ID,
        driverId: DRIVER_ID,
        manualReason: "barcode_scan_failed",
      }),
    );

    const entry = await svc.register({} as never, {
      driverId: DRIVER_ID,
      companyIds: [],
      body,
    });
    expect(entry.manualReason).toBe("manual_entry");
    expect(upsertManualRegistration).toHaveBeenLastCalledWith(
      expect.anything(),
      expect.objectContaining({ manualReason: "manual_entry" }),
    );
  });

  it("stores recipient name on the draft and contact separately", async () => {
    const { svc, commit, applyManualRecipientContact } = setup();
    await svc.register({} as never, {
      driverId: DRIVER_ID,
      companyIds: [],
      body: {
        ...body,
        recipientName: " 홍길동 ",
        recipientPhone: "010-1234-5678",
      },
    });
    expect(commit.mock.calls[0][2].drafts[0].customerName).toBe("홍길동");
    expect(applyManualRecipientContact).toHaveBeenCalledWith(
      expect.anything(),
      { pointId: POINT_ID, contactValue: "01012345678" },
    );
  });

  it("replays same idempotency key as duplicate with same ids", async () => {
    const { svc, commit } = setup({
      commitResult: { ok: true, resultCode: "duplicate", jobId: JOB_ID },
    });
    const out = await svc.register({} as never, {
      driverId: DRIVER_ID,
      companyIds: [],
      body,
    });
    expect(out.resultCode).toBe("duplicate");
    expect(out.pointId).toBe(POINT_ID);
    expect(commit).toHaveBeenCalledTimes(1);
  });

  it("keeps point registration when evidence meta persist fails", async () => {
    const { svc, upsertManualRegistration } = setup();
    upsertManualRegistration.mockResolvedValue(false);
    const out = await svc.register({} as never, {
      driverId: DRIVER_ID,
      companyIds: [],
      body,
    });
    expect(out.ok).toBe(true);
    expect(out.pointId).toBe(POINT_ID);
    expect(out.evidenceStatus).toBe("none");
  });

  it("does not insert a second source when one exists", async () => {
    const { svc, insert } = setup({ existingSource: true });
    await svc.ensureDriverManualSource(DRIVER_ID);
    await svc.ensureDriverManualSource(DRIVER_ID);
    expect(insert).not.toHaveBeenCalled();
  });

  it("rejects missing address and invalid quantity", async () => {
    const { svc } = setup();
    await expect(
      svc.register({} as never, {
        driverId: DRIVER_ID,
        companyIds: [],
        body: { commitIdempotencyKey: KEY },
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
    await expect(
      svc.register({} as never, {
        driverId: DRIVER_ID,
        companyIds: [],
        body: {
          commitIdempotencyKey: KEY,
          roadAddress: "서울 강남대로 1",
          quantity: -1,
        },
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it("persists valid search coordinates onto the created point", async () => {
    const { svc, commit, applyManualSearchLocation } = setup();
    await svc.register({} as never, {
      driverId: DRIVER_ID,
      companyIds: [],
      body: {
        ...body,
        latitude: 37.42,
        longitude: 126.74,
      },
    });
    const draft = commit.mock.calls[0][2].drafts[0];
    expect(draft.latitude).toBe(37.42);
    expect(draft.longitude).toBe(126.74);
    expect(draft.geocodeProvider).toBe("kakao");
    expect(draft.geocodeStatus).toBe("resolved");
    expect(applyManualSearchLocation).toHaveBeenCalledWith(
      expect.anything(),
      {
        pointId: POINT_ID,
        latitude: 37.42,
        longitude: 126.74,
        driverAdjusted: false,
      },
    );
  });

  it("leaves invalid coordinates pending and does not persist", async () => {
    const { svc, commit, applyManualSearchLocation } = setup();
    await svc.register({} as never, {
      driverId: DRIVER_ID,
      companyIds: [],
      body: {
        ...body,
        latitude: 91,
        longitude: 126.74,
      },
    });
    const draft = commit.mock.calls[0][2].drafts[0];
    expect(draft.latitude).toBeNull();
    expect(draft.longitude).toBeNull();
    expect(draft.geocodeStatus).toBe("pending");
    expect(applyManualSearchLocation).not.toHaveBeenCalled();
  });

  it("isolates ensure to the JWT driver", async () => {
    const { svc, findBySourceKey } = setup();
    const other = "33333333-3333-4333-8333-333333333333";
    await svc.ensureDriverManualSource(other);
    expect(findBySourceKey).toHaveBeenCalledWith(
      expect.anything(),
      "driver-manual",
      { ownerDriverId: other },
    );
  });
});
