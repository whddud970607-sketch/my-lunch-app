import { parse } from "csv-parse";
import { Readable } from "stream";
import { ImportDomainError } from "./import.errors";
import {
  IMPORT_MAX_BYTES,
  IMPORT_MAX_DATA_ROWS,
  type ImportParseOptions,
} from "./import.limits";
import type { ImportParser, ImportRow, ImportSourceFormat } from "./import.types";

async function materializeInput(
  input: AsyncIterable<Uint8Array> | Buffer | string,
  maxBytes: number,
): Promise<Buffer> {
  if (typeof input === "string") {
    const buf = Buffer.from(input, "utf8");
    if (buf.byteLength > maxBytes) {
      throw new ImportDomainError({
        code: "FILE_TOO_LARGE",
        message: `import exceeds maxBytes=${maxBytes}`,
      });
    }
    return buf;
  }
  if (Buffer.isBuffer(input)) {
    if (input.byteLength > maxBytes) {
      throw new ImportDomainError({
        code: "FILE_TOO_LARGE",
        message: `import exceeds maxBytes=${maxBytes}`,
      });
    }
    return input;
  }

  const chunks: Buffer[] = [];
  let total = 0;
  for await (const chunk of input) {
    const buf = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    total += buf.byteLength;
    if (total > maxBytes) {
      throw new ImportDomainError({
        code: "FILE_TOO_LARGE",
        message: `import exceeds maxBytes=${maxBytes}`,
      });
    }
    chunks.push(buf);
  }
  return Buffer.concat(chunks);
}

function cellToString(v: unknown): string | null {
  if (v == null) return null;
  if (typeof v === "string") return v;
  return String(v);
}

/**
 * CSV ImportParser — index-aligned header mapping (no silent field shift).
 *
 * With header[i] ↔ field[i]:
 * - short row → trailing fields missing (not left-shift of named columns)
 * - long row → extras preserved as __extra_N; COLUMN_COUNT_MISMATCH flagged
 *
 * Formula-injection: raw cell values preserved; sanitize only on export/display.
 */
export class CsvParseAdapter implements ImportParser {
  readonly format: ImportSourceFormat = "csv";

  constructor(private readonly defaults: ImportParseOptions = {}) {}

  async *parse(
    input: AsyncIterable<Uint8Array> | Buffer | string,
    options?: ImportParseOptions,
  ): AsyncIterable<ImportRow> {
    const maxRows = options?.maxRows ?? this.defaults.maxRows ?? IMPORT_MAX_DATA_ROWS;
    const maxBytes =
      options?.maxBytes ?? this.defaults.maxBytes ?? IMPORT_MAX_BYTES;

    const buffer = await materializeInput(input, maxBytes);

    // Array mode: we zip by index ourselves (safer than silent object mapping).
    const parser = parse({
      columns: false,
      bom: true,
      skip_empty_lines: true,
      relax_column_count: true,
      relax_quotes: true,
      trim: false,
      cast: false,
      skip_records_with_error: false,
    });

    const stream = Readable.from(buffer);
    stream.pipe(parser);

    let headers: string[] | null = null;
    let dataRowIndex = 0;

    try {
      for await (const record of parser) {
        if (!Array.isArray(record)) {
          throw new ImportDomainError({
            code: "MALFORMED_ROW",
            message: "malformed CSV record",
          });
        }

        if (headers == null) {
          headers = record.map((h, i) => {
            const s = cellToString(h)?.trim() ?? "";
            return s === "" ? `__empty_header_${i}` : s;
          });
          continue;
        }

        if (dataRowIndex >= maxRows) {
          throw new ImportDomainError({
            code: "ROW_LIMIT_EXCEEDED",
            message: `import exceeds maxRows=${maxRows}`,
            rowIndex: dataRowIndex + 1,
          });
        }
        dataRowIndex += 1;
        const rowIndex = dataRowIndex;
        const expected = headers.length;
        const actual = record.length;

        let columnMismatch: ImportRow["columnMismatch"] = null;
        if (actual < expected) columnMismatch = "short";
        else if (actual > expected) columnMismatch = "long";

        const raw: Record<string, string | null> = {};
        for (let i = 0; i < expected; i += 1) {
          raw[headers[i]] = i < actual ? cellToString(record[i]) : null;
        }
        // Preserve extras without shifting named columns.
        for (let i = expected; i < actual; i += 1) {
          raw[`__extra_${i - expected}`] = cellToString(record[i]);
        }

        yield {
          rowIndex,
          raw,
          expectedColumnCount: expected,
          actualColumnCount: actual,
          columnMismatch,
        };
      }
    } catch (err) {
      if (err instanceof ImportDomainError) throw err;
      const code =
        err && typeof err === "object" && "code" in err
          ? String((err as { code?: string }).code ?? "CSV_PARSE_ERROR")
          : "CSV_PARSE_ERROR";
      throw new ImportDomainError({
        code: code.startsWith("CSV") ? code : "CSV_PARSE_ERROR",
        message: "CSV parse failed",
        rowIndex: dataRowIndex > 0 ? dataRowIndex : undefined,
      });
    }
  }
}
