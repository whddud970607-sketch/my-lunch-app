/**
 * Scoped resolution diagnostic trace — sanitized enums/booleans/counts only.
 * Absent collector ⇒ zero overhead / no behavior change.
 * Fingerprints are process-memory only; never serialized into safe reports.
 */
import { createHash } from "node:crypto";

export const DiagnosticStage = {
  INPUT_RECEIVED: "INPUT_RECEIVED",
  HINTS_EXTRACTED: "HINTS_EXTRACTED",
  ADDRESS_PARSED: "ADDRESS_PARSED",
  PARCEL_RESOLVED: "PARCEL_RESOLVED",
  BUILDING_HUB_RESPONSE_CLASSIFIED: "BUILDING_HUB_RESPONSE_CLASSIFIED",
  REGISTER_CANDIDATES_NORMALIZED: "REGISTER_CANDIDATES_NORMALIZED",
  REGISTER_IDENTITY_MATCHED: "REGISTER_IDENTITY_MATCHED",
  PNU_BUILT: "PNU_BUILT",
  VWORLD_GEOMETRY_RESULT: "VWORLD_GEOMETRY_RESULT",
  INTERIOR_POINT_RESULT: "INTERIOR_POINT_RESULT",
  FINAL_RESOLUTION_DECISION: "FINAL_RESOLUTION_DECISION",
} as const;

export type DiagnosticStageName =
  (typeof DiagnosticStage)[keyof typeof DiagnosticStage];

/** Safe payload values only — no strings that could carry PII/secrets. */
export type DiagnosticSafeValue = boolean | number | null;

export type DiagnosticStagePayload = Record<string, DiagnosticSafeValue | string>;

export type DiagnosticStageEvent = {
  stage: DiagnosticStageName;
  atMs: number;
  payload: DiagnosticStagePayload;
};

type FingerprintKind = "parcel" | "complex" | "dong";

const FORBIDDEN_PAYLOAD_KEYS = new Set([
  "address",
  "roadAddress",
  "detailAddress",
  "normalizedAddress",
  "complexName",
  "buildingName",
  "complexNameHint",
  "dong",
  "dongHint",
  "customerName",
  "phone",
  "memo",
  "accessSecret",
  "latitude",
  "longitude",
  "lat",
  "lng",
  "coordinates",
  "jwt",
  "token",
  "apiKey",
  "serviceKey",
  "authorization",
  "url",
  "body",
  "raw",
  "pnu",
  "fingerprint",
  "hash",
]);

function isSafePayloadValue(v: unknown): v is DiagnosticSafeValue | string {
  if (v === null) return true;
  if (typeof v === "boolean" || typeof v === "number") return true;
  if (typeof v === "string") {
    // Enums / failure codes only — reject long or suspicious strings.
    if (v.length > 64) return false;
    if (/[/@]/.test(v)) return false;
    if (/Bearer|KakaoAK|eyJ[A-Za-z0-9_-]+\./i.test(v)) return false;
    return true;
  }
  return false;
}

function sanitizePayload(
  payload: Record<string, unknown>,
): DiagnosticStagePayload {
  const out: DiagnosticStagePayload = {};
  for (const [key, value] of Object.entries(payload)) {
    if (FORBIDDEN_PAYLOAD_KEYS.has(key)) continue;
    if (/fingerprint|hash|secret|key|token|jwt|url|body|raw/i.test(key)) {
      continue;
    }
    if (!isSafePayloadValue(value)) continue;
    out[key] = value;
  }
  return out;
}

function hashMaterial(material: string): string {
  return createHash("sha256").update(material, "utf8").digest("hex");
}

/**
 * In-memory diagnostic sink for a single controlled resolve().
 * Not a Nest provider — create per smoke/diagnostic invocation.
 */
export class ResolutionDiagnosticCollector {
  private readonly events: DiagnosticStageEvent[] = [];
  private readonly startedAt = Date.now();
  private readonly fingerprints = new Map<FingerprintKind, string[]>();

  emit(stage: DiagnosticStageName, payload: Record<string, unknown> = {}): void {
    this.events.push({
      stage,
      atMs: Date.now() - this.startedAt,
      payload: sanitizePayload(payload),
    });
  }

  /**
   * Record one-way fingerprint material. Never exposed via toSafeReport().
   */
  recordFingerprint(kind: FingerprintKind, material: string | null | undefined): void {
    if (material == null || material === "") return;
    const list = this.fingerprints.get(kind) ?? [];
    list.push(hashMaterial(material));
    this.fingerprints.set(kind, list);
  }

  fingerprintStable(kind: FingerprintKind): boolean | null {
    const list = this.fingerprints.get(kind);
    if (!list || list.length < 2) return null;
    return list.every((h) => h === list[0]);
  }

  stagesSeen(): DiagnosticStageName[] {
    return this.events.map((e) => e.stage);
  }

  hasStage(stage: DiagnosticStageName): boolean {
    return this.events.some((e) => e.stage === stage);
  }

  /** Serializable report — no fingerprint digests, no raw source values. */
  toSafeReport(): {
    stages: DiagnosticStageEvent[];
    parcelFingerprintStable: boolean | null;
    complexFingerprintStable: boolean | null;
    dongFingerprintStable: boolean | null;
  } {
    return {
      stages: this.events.map((e) => ({
        stage: e.stage,
        atMs: e.atMs,
        payload: { ...e.payload },
      })),
      parcelFingerprintStable: this.fingerprintStable("parcel"),
      complexFingerprintStable: this.fingerprintStable("complex"),
      dongFingerprintStable: this.fingerprintStable("dong"),
    };
  }

  serializeSafeJson(): string {
    return JSON.stringify(this.toSafeReport());
  }
}

export type ResolutionDiagnosticSink = ResolutionDiagnosticCollector;

/** No-op when sink absent — keeps production path free of required tracing. */
export function emitDiagnostic(
  sink: ResolutionDiagnosticSink | null | undefined,
  stage: DiagnosticStageName,
  payload: Record<string, unknown> = {},
): void {
  sink?.emit(stage, payload);
}

export function recordDiagnosticFingerprint(
  sink: ResolutionDiagnosticSink | null | undefined,
  kind: FingerprintKind,
  material: string | null | undefined,
): void {
  sink?.recordFingerprint(kind, material);
}

export function parcelFingerprintMaterial(parcel: {
  sigunguCd?: string;
  bjdongCd?: string;
  platGbCd?: string;
  bun?: string;
  ji?: string;
}): string {
  return [
    parcel.sigunguCd ?? "",
    parcel.bjdongCd ?? "",
    parcel.platGbCd ?? "",
    parcel.bun ?? "",
    parcel.ji ?? "",
  ].join("|");
}
