import {
  BadRequestException,
  Body,
  ConflictException,
  Controller,
  ForbiddenException,
  Get,
  NotFoundException,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
  Req,
  UseGuards,
} from "@nestjs/common";
import type { SupabaseClient } from "@supabase/supabase-js";
import { AuthGuard } from "../auth/auth.guard";
import { RolesGuard } from "../auth/roles.guard";
import { Roles } from "../auth/roles.decorator";
import { CurrentUser } from "../auth/current-user.decorator";
import type { AuthUser } from "../auth/auth.types";
import { AccessScopeService } from "../access/access-scope.service";
import { AccessInfoCryptoService } from "../access/access-info-crypto.service";
import { AccessSecretsService } from "../access/access-secrets.service";
import { DeliveriesRepository } from "./deliveries.repository";
import { DeliveryCompletionService } from "./delivery-completion.service";
import {
  parseServiceDateParam,
  TodayWorksetService,
} from "./today-workset.service";
import {
  fixtureGroupFromKey,
  mapPointStatusLabel,
  mapShipmentStatusLabel,
  parsePointLocation,
} from "./location.util";

/**
 * Delivery read/update. Ordinary point/PII/shipment reads use user JWT + RLS.
 * access-info ciphertext is Nest-only (service_role) after app-layer checks.
 */
@Controller("delivery")
@UseGuards(AuthGuard, RolesGuard)
export class DeliveriesController {
  constructor(
    private readonly deliveries: DeliveriesRepository,
    private readonly scope: AccessScopeService,
    private readonly accessSecrets: AccessSecretsService,
    private readonly accessCrypto: AccessInfoCryptoService,
    private readonly completion: DeliveryCompletionService,
    private readonly todayWorkset: TodayWorksetService,
  ) {}

  /**
   * Today's Workset projection (P0-B1-1).
   * Multi-job / multi-company for the authenticated driver only.
   * No PII / access secrets / route GPS history.
   */
  @Get("today")
  @Roles("driver")
  async getToday(
    @CurrentUser() user: AuthUser,
    @Req() req: { supabaseUser: SupabaseClient },
    @Query("date") date?: string,
  ) {
    const driverId = this.scope.forUser(user).requireDriverId();
    let serviceDate: string;
    try {
      serviceDate = parseServiceDateParam(date);
    } catch {
      throw new BadRequestException("date must be YYYY-MM-DD");
    }
    return this.todayWorkset.getToday(req.supabaseUser, {
      driverId,
      serviceDate,
    });
  }

  @Get("jobs/:id")
  @Roles("driver", "company_admin", "platform_admin")
  async getJob(
    @Param("id", ParseUUIDPipe) id: string,
    @CurrentUser() user: AuthUser,
    @Req() req: { supabaseUser: SupabaseClient },
  ) {
    const job = await this.deliveries.findJobById(req.supabaseUser, id);
    if (!job) {
      throw new ForbiddenException("Job not found or not accessible");
    }
    this.scope.forUser(user).assertCanAccessDriverResource({
      driverId: job.driver_id,
      companyId: job.company_id,
    });
    return {
      id: job.id,
      driverId: job.driver_id,
      companyId: job.company_id,
      status: job.status,
      serviceDate: job.service_date,
    };
  }

  /**
   * Lazy point detail for assigned driver (PII when allowed).
   * Never returns access secret plaintext — use GET access-info.
   */
  @Get("points/:pointId")
  @Roles("driver")
  async getPointDetail(
    @Param("pointId", ParseUUIDPipe) pointId: string,
    @CurrentUser() user: AuthUser,
    @Req() req: { supabaseUser: SupabaseClient },
  ) {
    const driverId = this.scope.forUser(user).requireDriverId();
    const point = await this.deliveries.findPointForDriver(
      req.supabaseUser,
      driverId,
      pointId,
    );
    if (!point) {
      throw new NotFoundException("point not found");
    }
    this.scope.forUser(user).assertCanAccessDriverResource({
      driverId: point.driver_id,
      companyId: null,
    });

    const coords = parsePointLocation(point.location);
    if (!coords) {
      throw new NotFoundException("point location unavailable");
    }

    const masked =
      point.status === "completed" || !!point.pii_masked_at;
    const pii = masked
      ? null
      : await this.deliveries.findMapSpikePii(req.supabaseUser, point.id);
    const contactType = masked ? "none" : (pii?.contact_type ?? "none");
    const contactValue =
      masked || contactType === "none" ? null : (pii?.contact_value ?? null);

    const shipmentRows = await this.deliveries.listShipmentsForPoints(
      req.supabaseUser,
      [point.id],
    );
    const shipments = shipmentRows.map((s) => ({
      shipmentId: s.id,
      sequenceNo: s.sequence_no,
      trackingCode: s.tracking_code,
      status: mapShipmentStatusLabel(s.status),
      statusCode: s.status,
      scannedAt: s.scanned_at,
      completedAt: s.completed_at,
    }));

    const accessSet = await this.accessSecrets.listPointIdsWithAccessInfo(
      req.supabaseUser,
      driverId,
      [point.id],
    );
    const revealable =
      !masked &&
      (point.status === "pending" || point.status === "in_progress");

    const job = await this.deliveries.findJobById(
      req.supabaseUser,
      point.job_id,
    );

    return {
      pointId: point.id,
      jobId: point.job_id,
      driverId: point.driver_id,
      companyId: job?.company_id ?? null,
      status: mapPointStatusLabel(point.status),
      statusCode: point.status,
      latitude: coords.latitude,
      longitude: coords.longitude,
      pinAccuracy: point.pin_accuracy,
      quantity: point.quantity,
      displayLabel: point.display_label,
      product: point.display_label,
      carrier: point.carrier_code ?? "",
      piiMasked: masked,
      customerName: masked ? "****" : (pii?.customer_name ?? ""),
      address: masked ? "****" : (pii?.raw_address ?? ""),
      detailAddress: masked ? "****" : (pii?.detail_address ?? ""),
      deliveryMemo: masked ? null : (pii?.delivery_memo ?? null),
      contactType,
      contactValue,
      contactAvailable:
        revealable &&
        contactType !== "none" &&
        !!(contactValue && contactValue.trim()),
      hasAccessInfo: revealable && accessSet.has(point.id),
      shipmentCount: shipments.length,
      shipments,
      fixtureGroup: fixtureGroupFromKey(point.tracking_or_order_key),
    };
  }

  @Get("map-spike")
  @Roles("driver")
  async getMapSpike(
    @CurrentUser() user: AuthUser,
    @Req() req: { supabaseUser: SupabaseClient },
  ) {
    const driverId = this.scope.forUser(user).requireDriverId();
    const points = await this.deliveries.listMapSpikePoints(
      req.supabaseUser,
      driverId,
    );
    if (!points.length) {
      throw new NotFoundException("Map spike point not found");
    }

    const point = points[0];
    this.scope.forUser(user).assertCanAccessDriverResource({
      driverId: point.driver_id,
      companyId: null,
    });

    const coords = parsePointLocation(point.location);
    if (!coords) {
      throw new NotFoundException("Map spike location unavailable");
    }

    const pii = await this.deliveries.findMapSpikePii(
      req.supabaseUser,
      point.id,
    );
    const masked = point.status === "completed" || !!point.pii_masked_at;
    const contactType = masked ? "none" : (pii?.contact_type ?? "none");
    const contactValue =
      masked || contactType === "none" ? null : (pii?.contact_value ?? null);
    const shipmentRows = await this.deliveries.listShipmentsForPoints(
      req.supabaseUser,
      [point.id],
    );
    const shipments = shipmentRows.map((s) => ({
      shipmentId: s.id,
      sequenceNo: s.sequence_no,
      trackingCode: s.tracking_code,
      status: mapShipmentStatusLabel(s.status),
      statusCode: s.status,
      scannedAt: s.scanned_at,
      completedAt: s.completed_at,
    }));
    const accessSet = await this.accessSecrets.listPointIdsWithAccessInfo(
      req.supabaseUser,
      driverId,
      [point.id],
    );

    return {
      provider: "kakao",
      pinAccuracy: point.pin_accuracy,
      latitude: coords.latitude,
      longitude: coords.longitude,
      carrier: point.carrier_code ?? "쿠팡",
      customerName: masked
        ? "****"
        : (pii?.customer_name ?? "테스트 고객"),
      address: masked ? "****" : (pii?.raw_address ?? ""),
      detailAddress: masked ? "****" : (pii?.detail_address ?? ""),
      deliveryMemo: masked ? null : (pii?.delivery_memo ?? null),
      product: point.display_label,
      quantity: point.quantity,
      status: mapPointStatusLabel(point.status),
      statusCode: point.status,
      pointId: point.id,
      jobId: point.job_id,
      driverId: point.driver_id,
      piiMasked: masked,
      contactType,
      contactValue,
      hasAccessInfo: !masked && accessSet.has(point.id),
      fixtureGroup: fixtureGroupFromKey(point.tracking_or_order_key),
      shipments,
    };
  }

  /**
   * Test-only list: namdong10 + seoul-parc1 fixtures for current driver.
   * JWT + RLS for points/PII/shipments. hasAccessInfo via Nest secret presence only.
   */
  @Get("map-spike/namdong10")
  @Roles("driver")
  async getNamdong10Fixture(
    @CurrentUser() user: AuthUser,
    @Req() req: { supabaseUser: SupabaseClient },
  ) {
    const t0 = Date.now();
    const driverId = this.scope.forUser(user).requireDriverId();
    this.scope.forUser(user).assertCanAccessDriverResource({
      driverId,
      companyId: null,
    });

    const rows = await this.deliveries.listNamdong10FixturePoints(
      req.supabaseUser,
      driverId,
    );
    if (!rows.length) {
      throw new NotFoundException("Namdong10 fixture points not found");
    }

    const piiRows = await this.deliveries.findMapSpikePiiBatch(
      req.supabaseUser,
      rows.map((r) => r.id),
    );
    const piiByPoint = new Map(piiRows.map((p) => [p.point_id, p]));
    const shipmentRows = await this.deliveries.listShipmentsForPoints(
      req.supabaseUser,
      rows.map((r) => r.id),
    );
    const shipmentsByPoint = new Map<string, typeof shipmentRows>();
    for (const s of shipmentRows) {
      const list = shipmentsByPoint.get(s.point_id) ?? [];
      list.push(s);
      shipmentsByPoint.set(s.point_id, list);
    }
    const accessSet = await this.accessSecrets.listPointIdsWithAccessInfo(
      req.supabaseUser,
      driverId,
      rows.map((r) => r.id),
    );

    const points = [];
    for (const point of rows) {
      const coords = parsePointLocation(point.location);
      if (!coords) continue;
      const pii = piiByPoint.get(point.id);
      const masked = point.status === "completed" || !!point.pii_masked_at;
      const qty = point.quantity;
      const contactType = masked ? "none" : (pii?.contact_type ?? "none");
      const contactValue =
        masked || contactType === "none" ? null : (pii?.contact_value ?? null);
      const shipments = (shipmentsByPoint.get(point.id) ?? []).map((s) => ({
        shipmentId: s.id,
        sequenceNo: s.sequence_no,
        trackingCode: s.tracking_code,
        status: mapShipmentStatusLabel(s.status),
        statusCode: s.status,
        scannedAt: s.scanned_at,
        completedAt: s.completed_at,
      }));
      points.push({
        pointId: point.id,
        latitude: coords.latitude,
        longitude: coords.longitude,
        totalQuantity: qty,
        quantity: qty,
        status: mapPointStatusLabel(point.status),
        statusCode: point.status,
        carrier: point.carrier_code ?? "쿠팡",
        product: point.display_label,
        displayLabel: point.display_label,
        customerName: masked ? "****" : (pii?.customer_name ?? ""),
        rawAddress: masked ? "****" : (pii?.raw_address ?? ""),
        address: masked ? "****" : (pii?.raw_address ?? ""),
        detailAddress: masked ? "****" : (pii?.detail_address ?? ""),
        deliveryMemo: masked ? null : (pii?.delivery_memo ?? null),
        pinAccuracy: point.pin_accuracy,
        geocodeProvider: "kakao",
        provider: "kakao",
        jobId: point.job_id,
        driverId: point.driver_id,
        piiMasked: masked,
        contactType,
        contactValue,
        hasAccessInfo: !masked && accessSet.has(point.id),
        fixtureGroup: fixtureGroupFromKey(point.tracking_or_order_key),
        shipments,
      });
    }

    if (!points.length) {
      throw new NotFoundException("Namdong10 fixture locations unavailable");
    }

    return {
      fixture: "namdong10-sim+seoul-parc1-sim",
      count: points.length,
      quantitySum: points.reduce((s, p) => s + p.totalQuantity, 0),
      points,
      timingMs: { apiHandler: Date.now() - t0 },
    };
  }

  /**
   * Decrypt access_info for assigned driver on active incomplete point.
   * Writes read_access_info audit before returning plaintext. Never logs secret.
   */
  @Get("points/:pointId/access-info")
  @Roles("driver")
  async getAccessInfo(
    @Param("pointId", ParseUUIDPipe) pointId: string,
    @CurrentUser() user: AuthUser,
    @Req() req: { supabaseUser: SupabaseClient },
  ) {
    const driverId = this.scope.forUser(user).requireDriverId();
    const point = await this.deliveries.findPointForDriver(
      req.supabaseUser,
      driverId,
      pointId,
    );
    if (!point) {
      throw new NotFoundException("point not found");
    }
    this.scope.forUser(user).assertCanAccessDriverResource({
      driverId: point.driver_id,
      companyId: null,
    });

    if (point.status === "completed" || point.status === "failed" || point.pii_masked_at) {
      throw new ForbiddenException("access-info denied for completed point");
    }
    if (point.status !== "pending" && point.status !== "in_progress") {
      throw new ForbiddenException("access-info denied for point status");
    }

    const job = await this.deliveries.findJobById(req.supabaseUser, point.job_id);
    if (!job || job.status !== "active") {
      throw new ForbiddenException("access-info requires active job");
    }
    if (job.driver_id !== driverId) {
      throw new ForbiddenException("access-info driver mismatch");
    }

    const secret = await this.accessSecrets.findSecretForAssignedPoint(
      req.supabaseUser,
      driverId,
      pointId,
    );
    if (!secret?.access_info_ciphertext || !secret.access_info_nonce) {
      throw new NotFoundException("access-info not found");
    }
    if (secret.access_info_purged_at) {
      throw new ForbiddenException("access-info purged");
    }
    if (
      secret.access_info_expires_at &&
      new Date(secret.access_info_expires_at).getTime() < Date.now()
    ) {
      throw new ForbiddenException("access-info expired");
    }
    if (secret.driver_id !== driverId) {
      throw new ForbiddenException("access-info driver mismatch");
    }

    const audited = await this.accessSecrets.insertReadAccessAudit(
      req.supabaseUser,
      {
        actorId: user.userId,
        actorRole: user.role,
        pointId,
        accessReason: "driver_view_door_code",
      },
    );
    if (!audited) {
      throw new ForbiddenException("access-info audit failed");
    }

    const ciphertext = coerceBytea(secret.access_info_ciphertext);
    const nonce = coerceBytea(secret.access_info_nonce);
    const keyVersion = secret.access_info_key_version ?? 1;
    const accessInfo = this.accessCrypto.decrypt(ciphertext, nonce, keyVersion);

    return {
      pointId,
      accessInfo,
      expiresAt: secret.access_info_expires_at,
    };
  }

  /** Driver-verified pin: long-pan map then save center (spike). */
  @Patch("map-spike/pin")
  @Roles("driver")
  async updateMapSpikePin(
    @CurrentUser() user: AuthUser,
    @Req() req: { supabaseUser: SupabaseClient },
    @Body()
    body: { pointId?: string; latitude?: number; longitude?: number },
  ) {
    const driverId = this.scope.forUser(user).requireDriverId();
    const pointId = body.pointId;
    const latitude = Number(body.latitude);
    const longitude = Number(body.longitude);
    if (!pointId || !Number.isFinite(latitude) || !Number.isFinite(longitude)) {
      throw new BadRequestException("pointId/latitude/longitude required");
    }
    if (latitude < 33 || latitude > 39 || longitude < 124 || longitude > 132) {
      throw new BadRequestException("coordinates out of Korea WGS84 range");
    }

    const point = await this.deliveries.findPointForDriver(
      req.supabaseUser,
      driverId,
      pointId,
    );
    if (!point) {
      throw new NotFoundException("Map spike point not found");
    }
    if (point.status === "completed") {
      throw new BadRequestException("completed point cannot move pin");
    }

    const ok = await this.deliveries.updateMapSpikePin(
      req.supabaseUser,
      pointId,
      latitude,
      longitude,
    );
    if (!ok) {
      throw new ForbiddenException("pin update failed");
    }

    return {
      ok: true,
      pointId,
      pinAccuracy: "driver_verified",
      latitude,
      longitude,
    };
  }

  /** Complete with photo already uploaded to delivery-proofs under driver path. */
  @Post("map-spike/complete")
  @Roles("driver")
  async completeMapSpike(
    @CurrentUser() user: AuthUser,
    @Req() req: { supabaseUser: SupabaseClient },
    @Body()
    body: {
      pointId?: string;
      storagePath?: string;
      latitude?: number;
      longitude?: number;
    },
  ) {
    const driverId = this.scope.forUser(user).requireDriverId();
    const pointId = body.pointId;
    const storagePath = body.storagePath?.trim();
    if (!pointId || !storagePath) {
      throw new BadRequestException("pointId and storagePath required");
    }
    if (!storagePath.startsWith(`${driverId}/${pointId}/`)) {
      throw new BadRequestException("storagePath must match driver/point prefix");
    }

    const point = await this.deliveries.findPointForDriver(
      req.supabaseUser,
      driverId,
      pointId,
    );
    if (!point) {
      throw new NotFoundException("Map spike point not found");
    }
    if (point.status === "completed") {
      throw new BadRequestException("already completed");
    }

    const lat =
      body.latitude != null && Number.isFinite(Number(body.latitude))
        ? Number(body.latitude)
        : undefined;
    const lng =
      body.longitude != null && Number.isFinite(Number(body.longitude))
        ? Number(body.longitude)
        : undefined;

    const result = await this.completion.completePoint(req.supabaseUser, {
      pointId,
      driverId,
      storagePath,
      latitude: lat,
      longitude: lng,
    });
    if (!result.ok) {
      throw new ForbiddenException(`complete failed code=${result.code ?? "?"}`);
    }

    return {
      ok: true,
      pointId,
      status: "completed",
      statusLabel: mapPointStatusLabel("completed"),
      piiMasked: true,
    };
  }

  /**
   * Idempotent delivery completion (P0-A Phase 2).
   * Shares domain truth with map-spike/complete via DeliveryCompletionService.
   */
  @Post("points/:pointId/complete")
  @Roles("driver")
  async completePointIdempotent(
    @Param("pointId", ParseUUIDPipe) pointId: string,
    @CurrentUser() user: AuthUser,
    @Req() req: { supabaseUser: SupabaseClient },
    @Body()
    body: {
      idempotencyKey?: string;
      payloadHash?: string;
      storagePath?: string;
      latitude?: number;
      longitude?: number;
    },
  ) {
    const driverId = this.scope.forUser(user).requireDriverId();
    const storagePath = body.storagePath?.trim();
    const idempotencyKey = body.idempotencyKey?.trim();
    const payloadHash = body.payloadHash?.trim();
    if (!storagePath || !idempotencyKey || !payloadHash) {
      throw new BadRequestException(
        "storagePath, idempotencyKey, and payloadHash required",
      );
    }
    if (!storagePath.startsWith(`${driverId}/${pointId}/`)) {
      throw new BadRequestException("storagePath must match driver/point prefix");
    }

    const point = await this.deliveries.findPointForDriver(
      req.supabaseUser,
      driverId,
      pointId,
    );
    if (!point) {
      throw new NotFoundException("point not found");
    }
    if (
      point.status !== "pending" &&
      point.status !== "in_progress" &&
      point.status !== "completed"
    ) {
      throw new ForbiddenException("point not completable in current status");
    }

    const lat =
      body.latitude != null && Number.isFinite(Number(body.latitude))
        ? Number(body.latitude)
        : undefined;
    const lng =
      body.longitude != null && Number.isFinite(Number(body.longitude))
        ? Number(body.longitude)
        : undefined;

    const result = await this.completion.completePoint(req.supabaseUser, {
      pointId,
      driverId,
      storagePath,
      latitude: lat,
      longitude: lng,
      idempotencyKey,
      payloadHash,
      operationType: "DELIVERY_COMPLETE",
    });

    if (!result.ok && result.code === "idempotency_payload_mismatch") {
      throw new ConflictException("idempotency_payload_mismatch");
    }
    if (
      !result.ok &&
      (result.code === "unauthorized" ||
        result.code === "forbidden_assignment" ||
        result.code === "42501" ||
        result.code === "PGRST301")
    ) {
      throw new ForbiddenException("complete forbidden");
    }
    if (!result.ok && result.code === "point_not_found") {
      throw new NotFoundException("point not found");
    }
    if (!result.ok) {
      throw new BadRequestException(result.code ?? "complete_failed");
    }

    return {
      ok: true,
      pointId: result.pointId,
      status: result.status,
      statusLabel: mapPointStatusLabel("completed"),
      piiMasked: true,
      resultCode: result.resultCode,
    };
  }
}

function coerceBytea(value: string | Buffer): Buffer {
  if (Buffer.isBuffer(value)) return value;
  const s = String(value);
  if (s.startsWith("\\x") || s.startsWith("\\\\x")) {
    const hex = s.replace(/^\\+x/i, "");
    return Buffer.from(hex, "hex");
  }
  return Buffer.from(s, "base64");
}
