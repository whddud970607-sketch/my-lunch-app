import {
  IMPORTABLE_SOURCE_TYPES_BY_FORMAT,
  type DeliverySourceType,
  type ImportContextResolution,
  type ImportContextResolveInput,
  type ResolvedImportSource,
} from "./import-context.port";

/** System sources are never importable via file/API commit paths. */
const NON_IMPORTABLE_SYSTEM_TYPES = new Set<DeliverySourceType>([
  "fixture",
  "unknown",
]);

export function evaluateImportContextResolution(
  found: ResolvedImportSource | null | undefined,
  input: ImportContextResolveInput,
): ImportContextResolution {
  const sourceId = input.batchSourceId ?? input.claimedSourceId ?? null;
  const sourceKey = input.claimedSourceKey ?? null;

  if (!sourceId && !sourceKey) {
    return { status: "source_required" };
  }

  if (!found) {
    return { status: "source_not_found" };
  }

  if (!found.isActive) {
    return { status: "source_not_allowed" };
  }

  if (NON_IMPORTABLE_SYSTEM_TYPES.has(found.sourceType)) {
    return { status: "source_not_allowed" };
  }

  const allowed = IMPORTABLE_SOURCE_TYPES_BY_FORMAT[input.importFormat];
  if (!allowed.has(found.sourceType)) {
    return {
      status: "source_type_not_importable",
      actualSourceType: found.sourceType,
      allowedSourceType: [...allowed].join("|"),
    };
  }

  if (found.companyId != null) {
    const actorCompanies = input.actorCompanyIds ?? [];
    if (!actorCompanies.includes(found.companyId)) {
      return { status: "source_not_allowed" };
    }
    if (
      input.claimedCompanyId &&
      input.claimedCompanyId !== found.companyId
    ) {
      return { status: "company_source_mismatch" };
    }
  }

  if (found.ownerDriverId != null) {
    if (
      !input.actorDriverId ||
      input.actorDriverId !== found.ownerDriverId
    ) {
      return { status: "personal_source_owner_mismatch" };
    }
  }

  return {
    status: "resolved",
    source: found,
    namespaceKey: `source:${found.id}`,
  };
}
