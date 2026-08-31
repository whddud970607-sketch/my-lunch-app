/**
 * Safe Import errors — never embed PII / raw cell values.
 */
export class ImportDomainError extends Error {
  readonly code: string;
  readonly rowIndex?: number;
  readonly field?: string;

  constructor(args: {
    code: string;
    message: string;
    rowIndex?: number;
    field?: string;
  }) {
    super(args.message);
    this.name = "ImportDomainError";
    this.code = args.code;
    this.rowIndex = args.rowIndex;
    this.field = args.field;
  }

  /** Log-safe payload (no cell values). */
  toLogMeta(): { code: string; rowIndex?: number; field?: string } {
    return {
      code: this.code,
      ...(this.rowIndex != null ? { rowIndex: this.rowIndex } : {}),
      ...(this.field ? { field: this.field } : {}),
    };
  }
}
