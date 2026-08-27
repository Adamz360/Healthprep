// src/utils/csv.ts
// Thin wrapper around papaparse so both the question bulk-importer and the
// payment-records exporter share one CSV implementation instead of each
// rolling their own parsing/escaping logic.

import Papa from 'papaparse';

export function parseCsv<T extends Record<string, string>>(fileText: string): { data: T[]; errors: string[] } {
  const result = Papa.parse<T>(fileText, {
    header: true,
    skipEmptyLines: true,
    transformHeader: (h) => h.trim(),
  });

  const errors = result.errors.map((e) => `Row ${(e.row ?? 0) + 2}: ${e.message}`);
  return { data: result.data, errors };
}

export function toCsv(rows: Record<string, string | number>[]): string {
  return Papa.unparse(rows);
}

/** Triggers a browser download of the given text content as a named file. */
export function downloadTextFile(filename: string, content: string, mimeType = 'text/csv;charset=utf-8;'): void {
  const blob = new Blob([content], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
}
