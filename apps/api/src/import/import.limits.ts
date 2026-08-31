/**
 * Import C1 limits — safety caps (not product UX quotas).
 * General use: 200–300 rows. Smoke: 1000. Hard cap: 2000 / 2 MiB.
 */
export const IMPORT_MAX_DATA_ROWS = 2000;
export const IMPORT_MAX_BYTES = 2 * 1024 * 1024;
export const IMPORT_SMOKE_ROW_TARGET = 1000;

export type ImportParseOptions = {
  maxRows?: number;
  maxBytes?: number;
};
