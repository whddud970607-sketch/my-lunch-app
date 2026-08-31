import {
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
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
import { DeliverySessionsService } from "./delivery-sessions.service";

@Controller("delivery/sessions")
@UseGuards(AuthGuard, RolesGuard)
@Roles("driver")
export class DeliverySessionsController {
  constructor(
    private readonly sessions: DeliverySessionsService,
    private readonly scope: AccessScopeService,
  ) {}

  @Post("start")
  async start(
    @CurrentUser() user: AuthUser,
    @Req() req: { supabaseUser: SupabaseClient },
    @Body()
    body: {
      idempotencyKey?: string;
      deliveryJobId?: string;
      clientStartedAt?: string;
      workdayId?: string;
    },
  ) {
    const driverId = this.scope.forUser(user).requireDriverId();
    return this.sessions.start(req.supabaseUser, driverId, {
      idempotencyKey: body.idempotencyKey ?? "",
      deliveryJobId: body.deliveryJobId,
      clientStartedAt: body.clientStartedAt,
      workdayId: body.workdayId,
    });
  }

  @Get("active")
  async active(
    @CurrentUser() user: AuthUser,
    @Req() req: { supabaseUser: SupabaseClient },
  ) {
    const driverId = this.scope.forUser(user).requireDriverId();
    return this.sessions.getActive(req.supabaseUser, driverId);
  }

  @Get(":sessionId")
  async getOne(
    @Param("sessionId", ParseUUIDPipe) sessionId: string,
    @CurrentUser() user: AuthUser,
    @Req() req: { supabaseUser: SupabaseClient },
  ) {
    const driverId = this.scope.forUser(user).requireDriverId();
    return this.sessions.getById(req.supabaseUser, driverId, sessionId);
  }

  @Post(":sessionId/route-points/batch")
  async batchPoints(
    @Param("sessionId", ParseUUIDPipe) sessionId: string,
    @CurrentUser() user: AuthUser,
    @Req() req: { supabaseUser: SupabaseClient },
    @Body()
    body: {
      points?: Array<{
        sequenceNo: number;
        recordedAt: string;
        latitude: number;
        longitude: number;
        accuracyM?: number | null;
        speedMps?: number | null;
        headingDeg?: number | null;
        source?: string;
      }>;
    },
  ) {
    const driverId = this.scope.forUser(user).requireDriverId();
    return this.sessions.ingestRouteBatch(
      req.supabaseUser,
      driverId,
      sessionId,
      body.points ?? [],
    );
  }

  @Post(":sessionId/end")
  async end(
    @Param("sessionId", ParseUUIDPipe) sessionId: string,
    @CurrentUser() user: AuthUser,
    @Req() req: { supabaseUser: SupabaseClient },
    @Body()
    body: {
      forceIncomplete?: boolean;
      finalize?: boolean;
    },
  ) {
    const driverId = this.scope.forUser(user).requireDriverId();
    return this.sessions.end(req.supabaseUser, driverId, sessionId, {
      forceIncomplete: body.forceIncomplete === true,
      finalize: body.finalize,
    });
  }

  @Post(":sessionId/finalize")
  async finalize(
    @Param("sessionId", ParseUUIDPipe) sessionId: string,
    @CurrentUser() user: AuthUser,
    @Req() req: { supabaseUser: SupabaseClient },
  ) {
    const driverId = this.scope.forUser(user).requireDriverId();
    return this.sessions.finalize(req.supabaseUser, driverId, sessionId);
  }

  @Get(":sessionId/report")
  async report(
    @Param("sessionId", ParseUUIDPipe) sessionId: string,
    @CurrentUser() user: AuthUser,
    @Req() req: { supabaseUser: SupabaseClient },
  ) {
    const driverId = this.scope.forUser(user).requireDriverId();
    return this.sessions.report(req.supabaseUser, driverId, sessionId);
  }

  @Get(":sessionId/route-points")
  async routePoints(
    @Param("sessionId", ParseUUIDPipe) sessionId: string,
    @CurrentUser() user: AuthUser,
    @Req() req: { supabaseUser: SupabaseClient },
    @Query("fromSequence") fromSequence?: string,
  ) {
    const driverId = this.scope.forUser(user).requireDriverId();
    const from = fromSequence ? Number(fromSequence) : undefined;
    return this.sessions.listRoutePointsForSession(
      req.supabaseUser,
      driverId,
      sessionId,
      Number.isFinite(from) ? from : undefined,
    );
  }
}
