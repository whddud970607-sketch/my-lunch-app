import { Module } from "@nestjs/common";
import { CsvParseAdapter } from "./csv-parse.adapter";
import { FakeImportContextResolver } from "./import-context.port";
import { ImportNormalizeService } from "./import-normalize.service";
import { ImportValidationEngine } from "./import-validation.engine";

/**
 * Import domain (C1 parse/normalize + C2 validation).
 * No HTTP controllers / upload / preview / commit endpoints.
 */
@Module({
  providers: [
    CsvParseAdapter,
    ImportNormalizeService,
    {
      provide: FakeImportContextResolver,
      useValue: new FakeImportContextResolver([]),
    },
    {
      provide: ImportValidationEngine,
      useFactory: (resolver: FakeImportContextResolver) =>
        new ImportValidationEngine(resolver),
      inject: [FakeImportContextResolver],
    },
  ],
  exports: [
    CsvParseAdapter,
    ImportNormalizeService,
    ImportValidationEngine,
    FakeImportContextResolver,
  ],
})
export class ImportModule {}
