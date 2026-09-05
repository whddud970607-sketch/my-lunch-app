import { Injectable, Logger } from "@nestjs/common";
import type { SupabaseClient } from "@supabase/supabase-js";
import { shouldOverwriteExistingManualLocation } from "./manual-register-coordinates";

export type DeliveryJobRow = {
  id: string;
  driver_id: string;
  company_id: string | null;
  status: string;
  service_date: string;
};

export type MapSpikePointRow = {
  id: string;
  job_id: string;
  driver_id: string;
  display_label: string;
  carrier_code: string | null;
  quantity: number;
  status: string;
  pin_accuracy: string;
  location: unknown;
  pii_masked_at: string | null;
  tracking_or_order_key: string | null;
};

export type MapSpikePiiRow = {
  point_id: string;
  customer_name: string | null;
  raw_address: string | null;
  detail_address: string | null;
  delivery_memo: string | null;
  contact_type: string | null;
  contact_value: string | null;
};

export type DeliveryShipmentRow = {
  id: string;
  point_id: string;
  sequence_no: number;
  tracking_code: string;
  status: string;
  scanned_at: string | null;
  completed_at: string | null;
};

@Injectable()
export class DeliveriesRepository {
  private readonly logger = new Logger(DeliveriesRepository.name);

  async findJobById(
    userClient: SupabaseClient,
    jobId: string,
  ): Promise<DeliveryJobRow | null> {
    const { data, error } = await userClient
      .from("delivery_jobs")
      .select("id, driver_id, company_id, status, service_date")
      .eq("id", jobId)
      .maybeSingle();

    if (error) {
      this.logger.warn(`delivery_jobs select failed code=${error.code}`);
      return null;
    }
    return (data as DeliveryJobRow | null) ?? null;
  }

  async listMapSpikePoints(
    userClient: SupabaseClient,
    driverId: string,
  ): Promise<MapSpikePointRow[]> {
    const { data, error } = await userClient
      .from("delivery_points")
      .select(
        "id, job_id, driver_id, display_label, carrier_code, quantity, status, pin_accuracy, location, pii_masked_at, tracking_or_order_key",
      )
      .eq("driver_id", driverId)
      .eq("tracking_or_order_key", "phase1-map-spike-kakao")
      .order("sequence_no", { ascending: true });

    if (error) {
      this.logger.warn(`delivery_points map spike failed code=${error.code}`);
      return [];
    }
    return (data as MapSpikePointRow[]) ?? [];
  }

  /**
   * Test-only: namdong10 + seoul-parc1 fixture points (RLS + driver_id).
   * Keys: fixture:namdong10-sim:% | fixture:seoul-parc1-sim:%
   */
  async listNamdong10FixturePoints(
    userClient: SupabaseClient,
    driverId: string,
  ): Promise<MapSpikePointRow[]> {
    const { data, error } = await userClient
      .from("delivery_points")
      .select(
        "id, job_id, driver_id, display_label, carrier_code, quantity, status, pin_accuracy, location, pii_masked_at, tracking_or_order_key",
      )
      .eq("driver_id", driverId)
      .or(
        "tracking_or_order_key.like.fixture:namdong10-sim:%,tracking_or_order_key.like.fixture:seoul-parc1-sim:%",
      )
      .order("sequence_no", { ascending: true });

    if (error) {
      this.logger.warn(`delivery_points fixture list failed code=${error.code}`);
      return [];
    }
    return (data as MapSpikePointRow[]) ?? [];
  }

  async findFirstPointIdForJob(
    userClient: SupabaseClient,
    driverId: string,
    jobId: string,
  ): Promise<string | null> {
    const { data, error } = await userClient
      .from("delivery_points")
      .select("id")
      .eq("driver_id", driverId)
      .eq("job_id", jobId)
      .order("created_at", { ascending: true })
      .limit(1)
      .maybeSingle();

    if (error) {
      this.logger.warn(`delivery_points by job failed code=${error.code}`);
      return null;
    }
    const id = (data as { id?: string } | null)?.id;
    return typeof id === "string" && id.length > 0 ? id : null;
  }

  /**
   * Persist Kakao suggest coords onto an existing point.
   * Does not overwrite a location already set by worker or driver pin.
   */
  async applyManualSearchLocation(
    admin: SupabaseClient,
    args: {
      pointId: string;
      latitude: number;
      longitude: number;
      driverAdjusted?: boolean;
    },
  ): Promise<boolean> {
    const ewkt = `SRID=4326;POINT(${args.longitude} ${args.latitude})`;
    const patch: Record<string, string> = { location: ewkt };
    if (args.driverAdjusted) {
      patch.driver_adjusted_location = ewkt;
      patch.pin_accuracy = "driver_verified";
    }
    let query = admin
      .from("delivery_points")
      .update(patch)
      .eq("id", args.pointId);
    if (!shouldOverwriteExistingManualLocation(args.driverAdjusted)) {
      // Do not clobber worker/driver pins with a later representative geocode.
      query = query.is("location", null);
    }
    const { error } = await query;

    if (error) {
      this.logger.warn(
        `manual search location persist failed code=${error.code}`,
      );
      return false;
    }
    return true;
  }

  async applyManualRecipientContact(
    admin: SupabaseClient,
    args: { pointId: string; contactValue: string },
  ): Promise<boolean> {
    const { error } = await admin
      .from("delivery_point_pii")
      .update({
        contact_type: "masked_number",
        contact_value: args.contactValue,
      })
      .eq("point_id", args.pointId);

    if (error) {
      this.logger.warn(
        `manual recipient contact persist failed code=${error.code}`,
      );
      return false;
    }
    return true;
  }

  /** Owned point lookup for pin adjust / complete (spike or fixture). */
  async findPointForDriver(
    userClient: SupabaseClient,
    driverId: string,
    pointId: string,
  ): Promise<MapSpikePointRow | null> {
    const { data, error } = await userClient
      .from("delivery_points")
      .select(
        "id, job_id, driver_id, display_label, carrier_code, quantity, status, pin_accuracy, location, pii_masked_at, tracking_or_order_key",
      )
      .eq("driver_id", driverId)
      .eq("id", pointId)
      .maybeSingle();

    if (error) {
      this.logger.warn(`delivery_points by id failed code=${error.code}`);
      return null;
    }
    return (data as MapSpikePointRow | null) ?? null;
  }

  /** Batch owned point lookup for access capability (RLS-scoped). */
  async listPointsForDriverByIds(
    userClient: SupabaseClient,
    driverId: string,
    pointIds: string[],
  ): Promise<
    Array<{
      id: string;
      job_id: string;
      driver_id: string;
      status: string;
      pii_masked_at: string | null;
    }>
  > {
    if (!pointIds.length) return [];
    const { data, error } = await userClient
      .from("delivery_points")
      .select("id, job_id, driver_id, status, pii_masked_at")
      .eq("driver_id", driverId)
      .in("id", pointIds);

    if (error) {
      this.logger.warn(`delivery_points batch by ids failed code=${error.code}`);
      return [];
    }
    return (data ?? []) as Array<{
      id: string;
      job_id: string;
      driver_id: string;
      status: string;
      pii_masked_at: string | null;
    }>;
  }

  async findMapSpikePii(
    userClient: SupabaseClient,
    pointId: string,
  ): Promise<MapSpikePiiRow | null> {
    const { data, error } = await userClient
      .from("delivery_point_pii")
      .select(
        "point_id, customer_name, raw_address, detail_address, delivery_memo, contact_type, contact_value",
      )
      .eq("point_id", pointId)
      .maybeSingle();

    if (error) {
      this.logger.warn(`delivery_point_pii map spike failed code=${error.code}`);
      return null;
    }
    return (data as MapSpikePiiRow | null) ?? null;
  }

  async findMapSpikePiiBatch(
    userClient: SupabaseClient,
    pointIds: string[],
  ): Promise<MapSpikePiiRow[]> {
    if (!pointIds.length) return [];
    const { data, error } = await userClient
      .from("delivery_point_pii")
      .select(
        "point_id, customer_name, raw_address, detail_address, delivery_memo, contact_type, contact_value",
      )
      .in("point_id", pointIds);

    if (error) {
      this.logger.warn(`delivery_point_pii batch failed code=${error.code}`);
      return [];
    }
    return (data as MapSpikePiiRow[]) ?? [];
  }

  async listShipmentsForPoints(
    userClient: SupabaseClient,
    pointIds: string[],
  ): Promise<DeliveryShipmentRow[]> {
    if (!pointIds.length) return [];
    const { data, error } = await userClient
      .from("delivery_shipments")
      .select(
        "id, point_id, sequence_no, tracking_code, status, scanned_at, completed_at",
      )
      .in("point_id", pointIds)
      .order("sequence_no", { ascending: true });

    if (error) {
      this.logger.warn(`delivery_shipments list failed code=${error.code}`);
      return [];
    }
    return (data as DeliveryShipmentRow[]) ?? [];
  }

  async updateMapSpikePin(
    userClient: SupabaseClient,
    pointId: string,
    latitude: number,
    longitude: number,
  ): Promise<boolean> {
    const ewkt = `SRID=4326;POINT(${longitude} ${latitude})`;
    const { error } = await userClient
      .from("delivery_points")
      .update({
        location: ewkt,
        driver_adjusted_location: ewkt,
        pin_accuracy: "driver_verified",
      })
      .eq("id", pointId);

    if (error) {
      this.logger.warn(`pin update failed code=${error.code}`);
      return false;
    }
    return true;
  }

  async completeMapSpikePoint(
    userClient: SupabaseClient,
    args: {
      pointId: string;
      driverId: string;
      storagePath: string;
      latitude?: number;
      longitude?: number;
    },
  ): Promise<{ ok: boolean; code?: string }> {
    const completedAt = new Date().toISOString();
    const completedLocation =
      args.latitude != null && args.longitude != null
        ? `SRID=4326;POINT(${args.longitude} ${args.latitude})`
        : null;

    const { error: proofErr } = await userClient.from("delivery_proofs").insert({
      point_id: args.pointId,
      driver_id: args.driverId,
      storage_path: args.storagePath,
      outcome: "completed",
      completed_at: completedAt,
      completed_location: completedLocation,
    });
    if (proofErr) {
      this.logger.warn(`proof insert failed code=${proofErr.code}`);
      return { ok: false, code: proofErr.code };
    }

    const { error: pointErr } = await userClient
      .from("delivery_points")
      .update({
        status: "completed",
        pii_masked_at: completedAt,
        display_label: "배송 완료",
      })
      .eq("id", args.pointId);

    if (pointErr) {
      this.logger.warn(`point complete failed code=${pointErr.code}`);
      return { ok: false, code: pointErr.code };
    }

    return { ok: true };
  }

  async findPointById(
    userClient: SupabaseClient,
    pointId: string,
  ): Promise<MapSpikePointRow | null> {
    const { data, error } = await userClient
      .from("delivery_points")
      .select(
        "id, job_id, driver_id, display_label, carrier_code, quantity, status, pin_accuracy, location, pii_masked_at, tracking_or_order_key",
      )
      .eq("id", pointId)
      .maybeSingle();

    if (error) {
      this.logger.warn(`delivery_points by id failed code=${error.code}`);
      return null;
    }
    return (data as MapSpikePointRow | null) ?? null;
  }

  async findManualRegistration(
    client: SupabaseClient,
    pointId: string,
  ): Promise<{
    pointId: string;
    driverId: string;
    registrationMethod: string;
    manualReason: "barcode_scan_failed" | "manual_entry";
    evidenceType: string | null;
    storagePath: string | null;
  } | null> {
    const { data, error } = await client
      .from("delivery_manual_registrations")
      .select(
        "point_id, driver_id, registration_method, manual_reason, evidence_type, storage_path",
      )
      .eq("point_id", pointId)
      .maybeSingle();

    if (error) {
      if (error.code === "42P01" || error.code === "PGRST205") {
        this.logger.warn("manual_registration_table_unavailable");
        return null;
      }
      this.logger.warn(`manual_registration select failed code=${error.code}`);
      return null;
    }
    const row = data as {
      point_id?: string;
      driver_id?: string;
      registration_method?: string;
      manual_reason?: "barcode_scan_failed" | "manual_entry";
      evidence_type?: string | null;
      storage_path?: string | null;
    } | null;
    if (!row?.point_id || !row.driver_id || !row.manual_reason) return null;
    return {
      pointId: row.point_id,
      driverId: row.driver_id,
      registrationMethod: row.registration_method ?? "manual",
      manualReason: row.manual_reason,
      evidenceType: row.evidence_type ?? null,
      storagePath: row.storage_path ?? null,
    };
  }

  async upsertManualRegistration(
    admin: SupabaseClient,
    args: {
      pointId: string;
      driverId: string;
      manualReason: "barcode_scan_failed" | "manual_entry";
    },
  ): Promise<boolean> {
    const { error } = await admin.from("delivery_manual_registrations").upsert(
      {
        point_id: args.pointId,
        driver_id: args.driverId,
        registration_method: "manual",
        manual_reason: args.manualReason,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "point_id" },
    );
    if (error) {
      if (error.code === "42P01" || error.code === "PGRST205") {
        this.logger.warn("manual_registration_table_unavailable");
        return false;
      }
      this.logger.warn(`manual_registration upsert failed code=${error.code}`);
      return false;
    }
    return true;
  }

  async attachManualInvoiceEvidence(
    admin: SupabaseClient,
    args: {
      pointId: string;
      driverId: string;
      manualReason: "barcode_scan_failed" | "manual_entry";
      evidenceType: string;
      storagePath: string;
      contentType: string;
      byteSize: number;
      capturedAt: string | null;
    },
  ): Promise<boolean> {
    const { error } = await admin.from("delivery_manual_registrations").upsert(
      {
        point_id: args.pointId,
        driver_id: args.driverId,
        registration_method: "manual",
        manual_reason: args.manualReason,
        evidence_type: args.evidenceType,
        storage_bucket: "delivery-proofs",
        storage_path: args.storagePath,
        content_type: args.contentType,
        byte_size: args.byteSize,
        captured_at: args.capturedAt,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "point_id" },
    );
    if (error) {
      if (error.code === "42P01" || error.code === "PGRST205") {
        this.logger.warn("manual_registration_table_unavailable");
        return false;
      }
      this.logger.warn(`manual_invoice_evidence attach failed code=${error.code}`);
      return false;
    }
    return true;
  }
}
