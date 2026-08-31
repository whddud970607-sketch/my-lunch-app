import { Injectable } from "@nestjs/common";
import { CsvParseAdapter } from "./csv-parse.adapter";
import {
  buildHeaderLookup,
  mapHeaders,
  type CanonicalImportField,
} from "./import.header-mapping";
import type { ImportParseOptions } from "./import.limits";
import { normalizeMappedRow } from "./import.normalizer";
import type {
  ImportParser,
  ImportRow,
  NormalizedDeliveryDraft,
} from "./import.types";

export type ImportNormalizeResult = {
  rows: ImportRow[];
  drafts: NormalizedDeliveryDraft[];
};

/**
 * C1 orchestration: parse → header map → normalize.
 * No DB, no geocode, no commit.
 */
@Injectable()
export class ImportNormalizeService {
  private readonly lookup = buildHeaderLookup();

  constructor(private readonly csvParser: CsvParseAdapter) {}

  getParser(format: "csv" = "csv"): ImportParser {
    if (format === "csv") return this.csvParser;
    throw new Error(`unsupported import format: ${format}`);
  }

  async parseCsvToRows(
    input: AsyncIterable<Uint8Array> | Buffer | string,
    options?: ImportParseOptions,
  ): Promise<ImportRow[]> {
    const rows: ImportRow[] = [];
    for await (const row of this.csvParser.parse(input, options)) {
      rows.push(row);
    }
    return rows;
  }

  normalizeRows(rows: ImportRow[]): NormalizedDeliveryDraft[] {
    return rows.map((row) => {
      const mapped = mapHeaders(row.raw, this.lookup);
      return normalizeMappedRow({
        rowIndex: row.rowIndex,
        mapped: mapped.mapped,
        missingRequired: mapped.missingRequired as CanonicalImportField[],
        unknownHeaders: mapped.unknownHeaders,
        raw: row.raw,
        expectedColumnCount: row.expectedColumnCount,
        actualColumnCount: row.actualColumnCount,
        columnMismatch: row.columnMismatch,
      });
    });
  }

  async parseAndNormalizeCsv(
    input: AsyncIterable<Uint8Array> | Buffer | string,
    options?: ImportParseOptions,
  ): Promise<ImportNormalizeResult> {
    const rows = await this.parseCsvToRows(input, options);
    const drafts = this.normalizeRows(rows);
    return { rows, drafts };
  }
}
