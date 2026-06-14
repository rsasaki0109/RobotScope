import { buildAlignedTimeSeriesData } from "./series-align.js";
import type { TimeSeriesPlotSeries } from "./types.js";

const CSV_MIME_TYPE = "text/csv;charset=utf-8";

function csvCell(value: string): string {
  return /[",\n\r]/.test(value) ? `"${value.replaceAll("\"", "\"\"")}"` : value;
}

function csvNumber(value: number): string {
  return Number.isFinite(value) ? String(value) : "";
}

function csvRelativeTimeSeconds(timeNs: number, startNs: number): string {
  return ((timeNs - startNs) / 1e9).toFixed(9);
}

export function buildTimeSeriesCsv(series: TimeSeriesPlotSeries[], startNs: number): string {
  const aligned = buildAlignedTimeSeriesData(series);
  const header = [
    "time_s_since_session_start",
    ...aligned.alignedSeries.map((item) => item.candidate.label),
  ].map(csvCell);
  const rows = [header.join(",")];

  for (let rowIndex = 0; rowIndex < aligned.timeNs.length; rowIndex += 1) {
    const row = [
      csvRelativeTimeSeconds(aligned.timeNs[rowIndex]!, startNs),
      ...aligned.valueColumns.map((column) => {
        const value = column[rowIndex];
        return value == null ? "" : csvNumber(value);
      }),
    ];
    rows.push(row.map(csvCell).join(","));
  }

  return `${rows.join("\n")}\n`;
}

export function countExportableRows(series: TimeSeriesPlotSeries[]): number {
  return buildAlignedTimeSeriesData(series).timeNs.length;
}

export function timeSeriesCsvFilename(nowMs = Date.now()): string {
  const timestamp = new Date(nowMs).toISOString().replace(/[:.]/g, "-");
  return `robotscope-timeseries-${timestamp}.csv`;
}

export function downloadCsv(csv: string, filename: string): void {
  const blob = new Blob([csv], { type: CSV_MIME_TYPE });
  const href = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = href;
  anchor.download = filename;
  anchor.style.display = "none";
  document.body.append(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(href);
}

export function downloadTimeSeriesCsv(series: TimeSeriesPlotSeries[], startNs: number): void {
  downloadCsv(buildTimeSeriesCsv(series, startNs), timeSeriesCsvFilename());
}
