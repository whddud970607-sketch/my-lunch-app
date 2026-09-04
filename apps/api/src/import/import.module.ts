import { Module } from "@nestjs/common";
import { AccessScopeService } from "../access/access-scope.service";
import { AuthModule } from "../auth/auth.module";
import { CsvParseAdapter } from "./csv-parse.adapter";
import {
  FakeImportContextResolver,
  type ImportContextResolver,
} from "./import-context.port";
import { DeliverySourceRepository } from "./delivery-source.repository";
import { ImportCommitController } from "./import-commit.controller";
import { ImportCommitRepository } from "./import-commit.repository";
import { ImportCommitService } from "./import-commit.service";
import { ImportNormalizeService } from "./import-normalize.service";
import { ImportValidationEngine } from "./import-validation.engine";
import { SupabaseImportContextAuthority } from "./supabase-import-context.authority";
import { IMPORT_COMMITTER, IMPORT_CONTEXT_RESOLVER } from "./import.tokens";

/**
 * Import domain (C1/C2 validation + C3 commit).
 * Commit performs DB writes via commit_import_batch_atomic only — zero provider geocode calls.
 */
@Module({
  imports: [AuthModule],
  controllers: [ImportCommitController],
  providers: [
    CsvParseAdapter,
    ImportNormalizeService,
    ImportCommitRepository,
    ImportCommitService,
    AccessScopeService,
    DeliverySourceRepository,
    SupabaseImportContextAuthority,
    {
      provide: IMPORT_CONTEXT_RESOLVER,
      useFactory: (): ImportContextResolver => new FakeImportContextResolver([]),
    },
    {
      provide: ImportValidationEngine,
      useFactory: (resolver: ImportContextResolver) =>
        new ImportValidationEngine(resolver),
      inject: [IMPORT_CONTEXT_RESOLVER],
    },
    {
      provide: IMPORT_COMMITTER,
      useExisting: ImportCommitService,
    },
  ],
  exports: [
    CsvParseAdapter,
    ImportNormalizeService,
    ImportValidationEngine,
    ImportCommitService,
    IMPORT_COMMITTER,
    IMPORT_CONTEXT_RESOLVER,
    SupabaseImportContextAuthority,
    DeliverySourceRepository,
  ],
})
export class ImportModule {}
