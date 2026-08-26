import { Injectable, Logger } from "@nestjs/common";
import type { SupabaseClient } from "@supabase/supabase-js";

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
};

export type MapSpikePiiRow = {
  point_id: string;
  customer_name: string | null;
  raw_address: string | null;
  detail_address: string | null;
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
        "id, job_id, driver_id, display_label, carrier_code, quantity, status, pin_accuracy, location, pii_masked_at",
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

  async findMapSpikePii(
    userClient: SupabaseClient,
    pointId: string,
  ): Promise<MapSpikePiiRow | null> {
    const { data, error } = await userClient
      .from("delivery_point_pii")
      .select("point_id, customer_name, raw_address, detail_address")
      .eq("point_id", pointId)
      .maybeSingle();

    if (error) {
      this.logger.warn(`delivery_point_pii map spike failed code=${error.code}`);
      return null;
    }
    return (data as MapSpikePiiRow | null) ?? null;
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
}
