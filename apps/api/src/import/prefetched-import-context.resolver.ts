import type {
  ImportContextResolution,
  ImportContextResolveInput,
  ImportContextResolver,
} from "./import-context.port";

/**
 * In-memory resolver seeded from an authoritative DB resolution (commit path only).
 */
export class PrefetchedImportContextResolver implements ImportContextResolver {
  constructor(
    private readonly batchResolution: ImportContextResolution,
    private readonly batchSourceId: string | null,
  ) {}

  resolve(input: ImportContextResolveInput): ImportContextResolution {
    if (
      input.batchSourceId &&
      input.batchSourceId === this.batchSourceId
    ) {
      return this.batchResolution;
    }
    if (
      input.claimedSourceId &&
      this.batchResolution.status === "resolved" &&
      input.claimedSourceId === this.batchResolution.source.id
    ) {
      return this.batchResolution;
    }
    return { status: "source_not_found" };
  }
}
