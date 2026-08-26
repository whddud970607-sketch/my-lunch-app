import {
  BadRequestException,
  Body,
  Controller,
  ForbiddenException,
  Get,
  NotFoundException,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
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
import { DeliveriesRepository } from "./deliveries.repository";
import { mapPointStatusLabel, parsePointLocation } from "./location.util";

/**
 * Minimal delivery read/update for Phase 1 map spike.
 * Uses user JWT + RLS only (no service_role bypass).
 */
@Controller("delivery")
@UseGuards(AuthGuard, RolesGuard)
export class DeliveriesController {
  constructor(
    private readonly deliveries: DeliveriesRepository,
    private readonly scope: AccessScopeService,
  ) {}

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
      product: point.display_label,
      quantity: point.quantity,
      status: mapPointStatusLabel(point.status),
      statusCode: point.status,
      pointId: point.id,
      jobId: point.job_id,
      driverId: point.driver_id,
      piiMasked: masked,
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

    const points = await this.deliveries.listMapSpikePoints(
      req.supabaseUser,
      driverId,
    );
    const point = points.find((p) => p.id === pointId);
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

    const points = await this.deliveries.listMapSpikePoints(
      req.supabaseUser,
      driverId,
    );
    const point = points.find((p) => p.id === pointId);
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

    const result = await this.deliveries.completeMapSpikePoint(
      req.supabaseUser,
      {
        pointId,
        driverId,
        storagePath,
        latitude: lat,
        longitude: lng,
      },
    );
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
}
