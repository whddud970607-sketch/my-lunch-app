import {
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
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
import { WorkdayService } from "./workday.service";

@Controller("delivery/workday")
@UseGuards(AuthGuard, RolesGuard)
@Roles("driver")
export class WorkdayController {
  constructor(
    private readonly workdays: WorkdayService,
    private readonly scope: AccessScopeService,
  ) {}

  @Post("start")
  async start(
    @CurrentUser() user: AuthUser,
    @Req() req: { supabaseUser: SupabaseClient },
    @Body() body: { idempotencyKey?: string },
  ) {
    const driverId = this.scope.forUser(user).requireDriverId();
    return this.workdays.start(req.supabaseUser, driverId, {
      idempotencyKey: body.idempotencyKey ?? "",
    });
  }

  @Get("active")
  async active(
    @CurrentUser() user: AuthUser,
    @Req() req: { supabaseUser: SupabaseClient },
  ) {
    const driverId = this.scope.forUser(user).requireDriverId();
    return this.workdays.getActive(req.supabaseUser, driverId);
  }

  @Get(":workdayId/report")
  async report(
    @Param("workdayId", ParseUUIDPipe) workdayId: string,
    @CurrentUser() user: AuthUser,
    @Req() req: { supabaseUser: SupabaseClient },
  ) {
    const driverId = this.scope.forUser(user).requireDriverId();
    return this.workdays.report(req.supabaseUser, driverId, workdayId);
  }

  @Get(":workdayId/route")
  async routeDetails(
    @Param("workdayId", ParseUUIDPipe) workdayId: string,
    @CurrentUser() user: AuthUser,
    @Req() req: { supabaseUser: SupabaseClient },
  ) {
    const driverId = this.scope.forUser(user).requireDriverId();
    return this.workdays.getRouteDetails(req.supabaseUser, driverId, workdayId);
  }

  @Get(":workdayId")
  async getOne(
    @Param("workdayId", ParseUUIDPipe) workdayId: string,
    @CurrentUser() user: AuthUser,
    @Req() req: { supabaseUser: SupabaseClient },
  ) {
    const driverId = this.scope.forUser(user).requireDriverId();
    return this.workdays.getById(req.supabaseUser, driverId, workdayId);
  }

  @Post(":workdayId/reconcile")
  async reconcile(
    @Param("workdayId", ParseUUIDPipe) workdayId: string,
    @CurrentUser() user: AuthUser,
    @Req() req: { supabaseUser: SupabaseClient },
  ) {
    const driverId = this.scope.forUser(user).requireDriverId();
    await this.workdays.requireOwn(req.supabaseUser, driverId, workdayId);
    const result = await this.workdays.reconcileMembership(
      req.supabaseUser,
      driverId,
      workdayId,
    );
    const view = await this.workdays.getById(
      req.supabaseUser,
      driverId,
      workdayId,
    );
    return { ...view, reconcile: result };
  }

  @Post(":workdayId/request-end")
  async requestEnd(
    @Param("workdayId", ParseUUIDPipe) workdayId: string,
    @CurrentUser() user: AuthUser,
    @Req() req: { supabaseUser: SupabaseClient },
    @Body()
    body: { forceIncomplete?: boolean; endIdempotencyKey?: string },
  ) {
    const driverId = this.scope.forUser(user).requireDriverId();
    return this.workdays.requestEnd(req.supabaseUser, driverId, workdayId, {
      forceIncomplete: body.forceIncomplete === true,
      endIdempotencyKey: body.endIdempotencyKey,
    });
  }

  @Post(":workdayId/finalize")
  async finalize(
    @Param("workdayId", ParseUUIDPipe) workdayId: string,
    @CurrentUser() user: AuthUser,
    @Req() req: { supabaseUser: SupabaseClient },
  ) {
    const driverId = this.scope.forUser(user).requireDriverId();
    return this.workdays.finalize(req.supabaseUser, driverId, workdayId);
  }
}
