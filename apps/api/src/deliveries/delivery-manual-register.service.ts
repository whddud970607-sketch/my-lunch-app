import {
  BadRequestException,
  Injectable,
  Logger,
  ServiceUnavailableException,
} from "@nestjs/common";
import type { SupabaseClient } from "@supabase/supabase-js";
import { composeDetailAddressWithComplex } from "../import/import-detail-compose";
import { DeliverySourceRepository } from "../import/delivery-source.repository";
import { ImportCommitService } from "../import/import-commit.service";
import type { NormalizedDeliveryDraft } from "../import/import.types";
import { summarizeSupabaseError } from "../supabase/supabase-error-log";
import { SupabaseServiceClient } from "../supabase/supabase-service.client";
import { DeliveriesRepository } from "./deliveries.repository";
import {
  DRIVER_MANUAL_SOURCE_DISPLAY_NAME,
  DRIVER_MANUAL_SOURCE_KEY,
  manualTrackingFromIdempotencyKey,
} from "./delivery-manual-identifier";
import { sanitizeManualCoordinates } from "./manual-register-coordinates";
import { parseServiceDateParam } from "./today-workset.service";

export type ManualRegisterRequest = {
  commitIdempotencyKey?: string;
  serviceDate?: string;
  roadAddress?: string | null;
  jibunAddress?: string | null;
  buildingName?: string | null;
  detailAddress?: string | null;
  dong?: string | null;
  unit?: string | null;
  quantity?: number;
  /** From server Kakao suggest. Validated; invalid → pending resolution. */
  latitude?: number | string | null;
  longitude?: number | string | null;
};

export type ManualRegisterResponse = {
  ok: boolean;
  resultCode: "applied" | "duplicate" | "rejected";
  pointId: string | null;
  jobId: string | null;
};

const MAX_QUANTITY = 9999;

function emptyToNull(value: string | null | undefined): string | null {
  if (value == null) return null;
  const t = value.replace(/\s+/g, " ").trim();
  return t === "" ? null : t;
}

export function composeManualDongHoDetail(args: {
  detailAddress?: string | null;
  dong?: string | null;
  unit?: string | null;
}): string | null {
  const extra = emptyToNull(args.detailAddress);
  const dong = emptyToNull(args.dong);
  const unit = emptyToNull(args.unit);
  const dongPart = dong ? (/동$/.test(dong) ? dong : `${dong}동`) : null;
  const hoPart = unit ? (/호$/.test(unit) ? unit : `${unit}호`) : null;
  const generated = [dongPart, hoPart].filter(Boolean).join(" ");
  if (!extra && !generated) return null;
  if (!extra) return generated;
  if (!generated) return extra;
  if (extra.includes(generated)) return extra;
  return `${generated} ${extra}`;
}

export function resolveManualRawAddress(args: {
  roadAddress?: string | null;
  jibunAddress?: string | null;
}): string | null {
  return emptyToNull(args.roadAddress) ?? emptyToNull(args.jibunAddress);
}

@Injectable()
export class DeliveryManualRegisterService {
  private readonly logger = new Logger(DeliveryManualRegisterService.name);

  constructor(
    private readonly sources: DeliverySourceRepository,
    private readonly commit: ImportCommitService,
    private readonly serviceSb: SupabaseServiceClient,
    private readonly deliveries: DeliveriesRepository,
  ) {}

  async register(
    userClient: SupabaseClient,
    args: {
      driverId: string;
      companyIds: string[];
      body: ManualRegisterRequest;
    },
  ): Promise<ManualRegisterResponse> {
    const key = args.body.commitIdempotencyKey?.trim() ?? "";
    if (!key) {
      throw new BadRequestException("commitIdempotencyKey is required");
    }

    let serviceDate: string;
    try {
      serviceDate = parseServiceDateParam(args.body.serviceDate);
    } catch {
      throw new BadRequestException("date must be YYYY-MM-DD");
    }

    const addressRaw = resolveManualRawAddress(args.body);
    if (!addressRaw) {
      throw new BadRequestException("address is required");
    }

    const quantity = args.body.quantity;
    const qty =
      quantity == null || quantity === undefined ? 1 : Number(quantity);
    if (!Number.isInteger(qty) || qty < 0 || qty > MAX_QUANTITY) {
      throw new BadRequestException("quantity must be a non-negative integer");
    }

    const sourceId = await this.ensureDriverManualSource(args.driverId);
    const trackingCode = manualTrackingFromIdempotencyKey(key);
    const buildingName = emptyToNull(args.body.buildingName);
    const detail = composeManualDongHoDetail(args.body);
    const displayLabel = buildingName ?? addressRaw;
    const coords = sanitizeManualCoordinates(
      args.body.latitude,
      args.body.longitude,
    );

    const draft: NormalizedDeliveryDraft = {
      rowIndex: 0,
      companyId: null,
      sourceId,
      sourceKey: DRIVER_MANUAL_SOURCE_KEY,
      serviceDate,
      trackingCode,
      externalId: trackingCode,
      quantity: qty,
      quantityOrigin: "explicit",
      customerName: null,
      addressRaw,
      addressNormalized: addressRaw.replace(/\s+/g, " ").trim(),
      detailAddress: composeDetailAddressWithComplex(buildingName, detail),
      complexName: buildingName,
      deliveryMemo: null,
      displayLabel,
      barcodeRaw: null,
      latitude: coords?.latitude ?? null,
      longitude: coords?.longitude ?? null,
      geocodeConfidence: coords ? 1 : null,
      geocodeProvider: coords ? "kakao" : null,
      geocodeStatus: coords ? "resolved" : "pending",
      issues: [],
    };

    const result = await this.commit.commit(
      userClient,
      { driverId: args.driverId, companyIds: args.companyIds },
      {
        commitIdempotencyKey: key,
        sourceId,
        format: "manual",
        serviceDate,
        drafts: [draft],
      },
    );

    if (!result.ok) {
      this.logger.warn(
        `manual_register_rejected code=${result.code ?? "unknown"}`,
      );
      throw new BadRequestException(result.code ?? "manual_register_rejected");
    }

    const jobId = result.jobId ?? null;
    let pointId: string | null = null;
    if (jobId) {
      pointId = await this.deliveries.findFirstPointIdForJob(
        userClient,
        args.driverId,
        jobId,
      );
    }

    if (coords && pointId) {
      const admin = this.serviceSb.getOrNull();
      if (admin) {
        const persisted = await this.deliveries.applyManualSearchLocation(
          admin,
          {
            pointId,
            latitude: coords.latitude,
            longitude: coords.longitude,
          },
        );
        if (!persisted) {
          this.logger.warn("manual_search_location_persist_failed");
        }
      } else {
        this.logger.warn("manual_search_location_persist_unavailable");
      }
    }

    return {
      ok: true,
      resultCode: result.resultCode === "duplicate" ? "duplicate" : "applied",
      pointId,
      jobId,
    };
  }

  async ensureDriverManualSource(driverId: string): Promise<string> {
    const admin = this.serviceSb.getOrNull();
    if (!admin) {
      throw new ServiceUnavailableException("source_ensure_unavailable");
    }

    const existing = await this.findManualSource(admin, driverId);
    if (existing) return existing;

    const { data, error } = await admin
      .from("delivery_sources")
      .insert({
        company_id: null,
        owner_driver_id: driverId,
        source_type: "driver_manual",
        source_key: DRIVER_MANUAL_SOURCE_KEY,
        display_name: DRIVER_MANUAL_SOURCE_DISPLAY_NAME,
        is_active: true,
      })
      .select("id")
      .maybeSingle();

    if (error && error.code !== "23505") {
      this.logger.warn(
        `manual_source_insert_failed ${summarizeSupabaseError(error)}`,
      );
      throw new ServiceUnavailableException("source_ensure_failed");
    }

    const inserted = (data as { id?: string } | null)?.id;
    if (inserted) return inserted;

    const replay = await this.findManualSource(admin, driverId);
    if (!replay) {
      throw new ServiceUnavailableException("source_ensure_failed");
    }
    return replay;
  }

  private async findManualSource(
    client: SupabaseClient,
    driverId: string,
  ): Promise<string | null> {
    const rows = await this.sources.findBySourceKey(
      client,
      DRIVER_MANUAL_SOURCE_KEY,
      { ownerDriverId: driverId },
    );
    const mine = rows.find(
      (r) =>
        r.ownerDriverId === driverId &&
        r.sourceType === "driver_manual" &&
        r.isActive,
    );
    return mine?.id ?? null;
  }
}
