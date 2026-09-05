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
import { AddressResolutionService } from "../address/address-resolution.service";
import {
  pickManualCoordinatePriority,
  sanitizeManualCoordinates,
} from "./manual-register-coordinates";
import { parseServiceDateParam } from "./today-workset.service";
import {
  parseManualReason,
  parseRegistrationMethod,
} from "./manual-invoice-evidence";

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
  recipientName?: string | null;
  recipientPhone?: string | null;
  /** True when lat/lng came from driver pin adjust. */
  pinAdjusted?: boolean;
  /** Base suggest or driver-adjusted coords. Never a ho-level guess. */
  latitude?: number | string | null;
  longitude?: number | string | null;
  registrationMethod?: string | null;
  manualReason?: string | null;
};

const MAX_RECIPIENT_NAME = 80;
const MAX_RECIPIENT_PHONE = 20;

export type ManualRegisterResponse = {
  ok: boolean;
  resultCode: "applied" | "duplicate" | "rejected";
  pointId: string | null;
  jobId: string | null;
  registrationMethod: "manual";
  manualReason: "barcode_scan_failed" | "manual_entry";
  evidenceStatus: "none";
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

export function sanitizeRecipientName(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const t = value.replace(/\s+/g, " ").trim();
  if (!t) return null;
  return t.length > MAX_RECIPIENT_NAME ? t.slice(0, MAX_RECIPIENT_NAME) : t;
}

/** Keeps digits and a leading +. Does not log the value. */
export function sanitizeRecipientPhone(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const t = value.trim();
  if (!t) return null;
  const compact = t.replace(/[^\d+]/g, "");
  if (compact.length < 8 || compact.length > MAX_RECIPIENT_PHONE) return null;
  return compact;
}

@Injectable()
export class DeliveryManualRegisterService {
  private readonly logger = new Logger(DeliveryManualRegisterService.name);

  constructor(
    private readonly sources: DeliverySourceRepository,
    private readonly commit: ImportCommitService,
    private readonly serviceSb: SupabaseServiceClient,
    private readonly deliveries: DeliveriesRepository,
    private readonly address: AddressResolutionService,
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

    let registrationMethod: "manual";
    let manualReason: "barcode_scan_failed" | "manual_entry";
    try {
      registrationMethod = parseRegistrationMethod(
        args.body.registrationMethod,
      );
      manualReason = parseManualReason(args.body.manualReason);
    } catch (e) {
      const code = e instanceof Error ? e.message : "invalid_manual_reason";
      throw new BadRequestException(code);
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
    const recipientName = sanitizeRecipientName(args.body.recipientName);
    const recipientPhone = sanitizeRecipientPhone(args.body.recipientPhone);
    const payloadCoords = sanitizeManualCoordinates(
      args.body.latitude,
      args.body.longitude,
    );
    const adjusted = args.body.pinAdjusted === true ? payloadCoords : null;
    const baseCoords = args.body.pinAdjusted === true ? null : payloadCoords;
    let apartmentDong: ReturnType<typeof sanitizeManualCoordinates> = null;
    if (!adjusted && baseCoords && buildingName && emptyToNull(args.body.dong)) {
      const dongHit = await this.address.lookupApartmentDongCoords({
        buildingName,
        dong: emptyToNull(args.body.dong),
        latitude: baseCoords.latitude,
        longitude: baseCoords.longitude,
      });
      apartmentDong = dongHit
        ? sanitizeManualCoordinates(dongHit.latitude, dongHit.longitude)
        : null;
    }
    const picked = pickManualCoordinatePriority({
      adjusted,
      apartmentDong,
      baseAddress: baseCoords,
    });
    const coords = picked?.coords ?? null;

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
      customerName: recipientName,
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

    if (pointId) {
      const admin = this.serviceSb.getOrNull();
      if (coords) {
        if (admin) {
          const persisted = await this.deliveries.applyManualSearchLocation(
            admin,
            {
              pointId,
              latitude: coords.latitude,
              longitude: coords.longitude,
              driverAdjusted: picked?.source === "manual_adjust",
            },
          );
          if (!persisted) {
            this.logger.warn("manual_search_location_persist_failed");
          }
        } else {
          this.logger.warn("manual_search_location_persist_unavailable");
        }
      }
      if (recipientPhone && admin) {
        await this.deliveries.applyManualRecipientContact(admin, {
          pointId,
          contactValue: recipientPhone,
        });
      }
      if (admin) {
        const persisted = await this.deliveries.upsertManualRegistration(
          admin,
          {
            pointId,
            driverId: args.driverId,
            manualReason,
          },
        );
        if (!persisted) {
          this.logger.warn("manual_registration_meta_persist_failed");
        }
      }
    }

    return {
      ok: true,
      resultCode: result.resultCode === "duplicate" ? "duplicate" : "applied",
      pointId,
      jobId,
      registrationMethod,
      manualReason,
      evidenceStatus: "none",
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
