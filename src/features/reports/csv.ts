/** Small CSV export used by every report and finance table. */

export type CsvValue = string | number | boolean | null | undefined;

export interface CsvColumn<R> {
  header: string;
  value: (row: R) => CsvValue;
}

function escapeCell(v: CsvValue): string {
  if (v === null || v === undefined) return '';
  const s = String(v);
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

export function toCsv<R>(columns: CsvColumn<R>[], rows: R[]): string {
  const head = columns.map((c) => escapeCell(c.header)).join(',');
  const body = rows.map((r) => columns.map((c) => escapeCell(c.value(r))).join(','));
  return [head, ...body].join('\r\n');
}

/** Downloads a CSV file in the browser. Numbers stay raw (no currency symbols) so spreadsheets can sum them. */
export function downloadCsv<R>(filename: string, columns: CsvColumn<R>[], rows: R[]): void {
  const blob = new Blob([`﻿${toCsv(columns, rows)}`], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename.endsWith('.csv') ? filename : `${filename}.csv`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}
