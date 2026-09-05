import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
  ServiceUnavailableException,
} from "@nestjs/common";
import { randomUUID } from "crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { AuthUser } from "../auth/auth.types";
import { AccessScopeService } from "../access/access-scope.service";
import { SupabaseServiceClient } from "../supabase/supabase-service.client";
import { DeliveriesRepository } from "./deliveries.repository";
import {
  INVOICE_EVIDENCE_SIGNED_TTL_SEC,
  InvoiceEvidenceValidationError,
  MANUAL_INVOICE_EVIDENCE_BUCKET,
  buildManualInvoiceStoragePath,
  decodeEvidenceBase64,
  evidenceTypeForReason,
  parseManualReason,
  prepareInvoiceEvidenceBytes,
  type ManualReason,
} from "./manual-invoice-evidence";

export type InvoiceEvidenceUploadRequest = {
  contentType?: string | null;
  capturedAt?: string | null;
  bytesBase64?: string | null;
  manualReason?: string | null;
};

@Injectable()
export class DeliveryManualInvoiceEvidenceService {
  private readonly logger = new Logger(
    DeliveryManualInvoiceEvidenceService.name,
  );

  constructor(
    private readonly deliveries: DeliveriesRepository,
    private readonly serviceSb: SupabaseServiceClient,
    private readonly scope: AccessScopeService,
  ) {}

  async upload(
    userClient: SupabaseClient,
    args: {
      user: AuthUser;
      pointId: string;
      body: InvoiceEvidenceUploadRequest;
    },
  ): Promise<{
    ok: true;
    evidenceStatus: "uploaded";
    evidenceType: string;
    hasEvidence: true;
  }> {
    const driverId = this.scope.forUser(args.user).requireDriverId();
    const point = await this.deliveries.findPointForDriver(
      userClient,
      driverId,
      args.pointId,
    );
    if (!point || point.driver_id !== driverId) {
      throw new ForbiddenException("point_ownership_denied");
    }

    const prepared = this.prepareBody(args.body);

    const admin = this.serviceSb.getOrNull();
    if (!admin) {
      throw new ServiceUnavailableException("evidence_storage_unavailable");
    }

    const existing = await this.deliveries.findManualRegistration(
      admin,
      args.pointId,
    );
    if (existing?.storagePath) {
      return {
        ok: true,
        evidenceStatus: "uploaded",
        evidenceType: existing.evidenceType ?? "manual_invoice",
        hasEvidence: true,
      };
    }

    let reason: ManualReason = existing?.manualReason ?? "manual_entry";
    if (!existing && args.body.manualReason != null) {
      try {
        reason = parseManualReason(args.body.manualReason);
      } catch {
        throw new BadRequestException("invalid_manual_reason");
      }
    }

    const objectName = `${randomUUID()}.jpg`;
    const storagePath = buildManualInvoiceStoragePath({
      driverId,
      pointId: args.pointId,
      objectName,
    });
    const capturedAt = this.parseCapturedAt(args.body.capturedAt);

    const { error: upErr } = await admin.storage
      .from(MANUAL_INVOICE_EVIDENCE_BUCKET)
      .upload(storagePath, prepared.bytes, {
        contentType: prepared.contentType,
        upsert: false,
      });
    if (upErr) {
      this.logger.warn("manual_invoice_evidence_upload_failed");
      throw new ServiceUnavailableException("evidence_upload_failed");
    }

    const attached = await this.deliveries.attachManualInvoiceEvidence(admin, {
      pointId: args.pointId,
      driverId,
      manualReason: reason,
      evidenceType: evidenceTypeForReason(reason),
      storagePath,
      contentType: prepared.contentType,
      byteSize: prepared.bytes.length,
      capturedAt,
    });
    if (!attached) {
      await admin.storage
        .from(MANUAL_INVOICE_EVIDENCE_BUCKET)
        .remove([storagePath]);
      this.logger.warn("manual_invoice_evidence_relation_failed");
      throw new ServiceUnavailableException("evidence_relation_failed");
    }

    this.logger.log("manual_invoice_evidence_uploaded");
    return {
      ok: true,
      evidenceStatus: "uploaded",
      evidenceType: evidenceTypeForReason(reason),
      hasEvidence: true,
    };
  }

  async readSigned(
    userClient: SupabaseClient,
    args: { user: AuthUser; pointId: string },
  ): Promise<{
    hasEvidence: boolean;
    evidenceType: string | null;
    registrationMethod: string | null;
    manualReason: string | null;
    expiresIn: number;
    signedUrl: string | null;
  }> {
    const point = await this.requireAccessiblePoint(userClient, args);
    const admin = this.serviceSb.getOrNull();
    if (!admin) {
      throw new ServiceUnavailableException("evidence_storage_unavailable");
    }
    const row = await this.deliveries.findManualRegistration(admin, point.id);
    if (!row?.storagePath) {
      throw new NotFoundException("evidence_not_found");
    }

    const { data, error } = await admin.storage
      .from(MANUAL_INVOICE_EVIDENCE_BUCKET)
      .createSignedUrl(row.storagePath, INVOICE_EVIDENCE_SIGNED_TTL_SEC);
    if (error || !data?.signedUrl) {
      this.logger.warn("manual_invoice_evidence_signed_url_failed");
      throw new ServiceUnavailableException("evidence_signed_url_failed");
    }

    return {
      hasEvidence: true,
      evidenceType: row.evidenceType,
      registrationMethod: row.registrationMethod,
      manualReason: row.manualReason,
      expiresIn: INVOICE_EVIDENCE_SIGNED_TTL_SEC,
      signedUrl: data.signedUrl,
    };
  }

  async hasEvidence(pointId: string): Promise<boolean> {
    const admin = this.serviceSb.getOrNull();
    if (!admin) return false;
    const row = await this.deliveries.findManualRegistration(admin, pointId);
    return !!row?.storagePath;
  }

  private async requireAccessiblePoint(
    userClient: SupabaseClient,
    args: { user: AuthUser; pointId: string },
  ) {
    const scoped = this.scope.forUser(args.user);
    if (args.user.role === "driver") {
      const driverId = scoped.requireDriverId();
      const point = await this.deliveries.findPointForDriver(
        userClient,
        driverId,
        args.pointId,
      );
      if (!point || point.driver_id !== driverId) {
        throw new ForbiddenException("point_ownership_denied");
      }
      scoped.assertCanAccessDriverResource({
        driverId: point.driver_id,
        companyId: null,
      });
      return point;
    }

    const point = await this.deliveries.findPointById(
      userClient,
      args.pointId,
    );
    if (!point) {
      throw new ForbiddenException("point_ownership_denied");
    }
    const job = await this.deliveries.findJobById(userClient, point.job_id);
    scoped.assertCanAccessDriverResource({
      driverId: point.driver_id,
      companyId: job?.company_id ?? null,
    });
    return point;
  }

  private parseCapturedAt(raw: string | null | undefined): string | null {
    if (!raw || typeof raw !== "string") return null;
    const t = Date.parse(raw);
    if (Number.isNaN(t)) return null;
    return new Date(t).toISOString();
  }

  private prepareBody(body: InvoiceEvidenceUploadRequest) {
    try {
      const bytes = decodeEvidenceBase64(body.bytesBase64);
      return prepareInvoiceEvidenceBytes(bytes, body.contentType);
    } catch (error) {
      if (error instanceof InvoiceEvidenceValidationError) {
        throw new BadRequestException(error.code);
      }
      throw new BadRequestException("invalid_mime");
    }
  }
}
