import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  Logger,
} from "@nestjs/common";
import type { SupabaseClient } from "@supabase/supabase-js";
import { draftsToCommitRpcRows } from "./import-commit.mapper";
import { ImportCommitRepository } from "./import-commit.repository";
import {
  sanitizeCommitLogMeta,
  toPublicCommitResponse,
} from "./import-commit.response";
import type {
  ImportCommitRequest,
  ImportCommitResult,
} from "./import-commit.types";
import { PrefetchedImportContextResolver } from "./prefetched-import-context.resolver";
import { SupabaseImportContextAuthority } from "./supabase-import-context.authority";
import { ImportValidationEngine } from "./import-validation.engine";
import type { ImportCommitter } from "./import.types";

export type ImportCommitActor = {
  driverId: string;
  companyIds: string[];
};

@Injectable()
export class ImportCommitService implements ImportCommitter {
  private readonly logger = new Logger(ImportCommitService.name);

  constructor(
    private readonly repository: ImportCommitRepository,
    private readonly contextAuthority: SupabaseImportContextAuthority,
  ) {}

  async commit(
    userClient: SupabaseClient,
    actor: ImportCommitActor,
    request: ImportCommitRequest,
  ): Promise<ImportCommitResult> {
    this.assertJwtAuthoritativeDriver(actor, request);

    const key = request.commitIdempotencyKey?.trim();
    if (!key) {
      throw new BadRequestException("commitIdempotencyKey is required");
    }

    const context = await this.contextAuthority.resolve(userClient, {
      actorDriverId: actor.driverId,
      actorCompanyIds: actor.companyIds,
      batchSourceId: request.sourceId,
      importFormat: request.format,
    });

    if (context.status !== "resolved") {
      throw new ForbiddenException(`import_context_${context.status}`);
    }

    const validationEngine = new ImportValidationEngine(
      new PrefetchedImportContextResolver(context, request.sourceId),
    );
    const validation = validationEngine.validate(request.drafts, {
      actorDriverId: actor.driverId,
      actorCompanyIds: actor.companyIds,
      batchSourceId: request.sourceId,
    }, { importFormat: request.format });

    if (!validation.canCommit) {
      throw new BadRequestException({
        code: "validation_not_committable",
        errorCount: validation.errorRows,
      });
    }

    if (context.source.id !== request.sourceId) {
      throw new ForbiddenException("source_not_allowed");
    }

    const rows = draftsToCommitRpcRows(validation.drafts);
    const result = await this.repository.rpcCommitImportBatch(userClient, {
      commitIdempotencyKey: key,
      sourceId: request.sourceId,
      format: request.format,
      serviceDate: request.serviceDate,
      rows,
    });

    this.logger.log(
      `import_commit ${JSON.stringify(sanitizeCommitLogMeta(result))}`,
    );

    return toPublicCommitResponse(result);
  }

  private assertJwtAuthoritativeDriver(
    actor: ImportCommitActor,
    request: ImportCommitRequest,
  ): void {
    if (
      request.claimedDriverId &&
      request.claimedDriverId !== actor.driverId
    ) {
      throw new ForbiddenException("client_driver_id_rejected");
    }
    if (request.claimedCompanyId) {
      const allowed =
        actor.companyIds.includes(request.claimedCompanyId) ||
        actor.companyIds.length === 0;
      if (!allowed) {
        throw new ForbiddenException("client_company_id_rejected");
      }
    }
  }
}

export function assertNoProviderCallsDuringCommit(): void {
  // Compile-time documentation hook — commit path must not inject AddressResolutionService.
}
