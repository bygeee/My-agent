import type { Column } from "./types.js";

export function printJson(value: unknown) {
  process.stdout.write(`${JSON.stringify(value, null, 2)}\n`);
}

export function printTable(rows: Array<Record<string, unknown>>, columns: Column[]) {
  if (rows.length === 0) {
    process.stdout.write("(none)\n");
    return;
  }

  const formattedRows = rows.map((row) => columns.map((column) => formatCell(row[column.key], column.max)));
  const widths = columns.map((column, index) => {
    const cells = formattedRows.map((row) => row[index] ?? "");
    return Math.max(column.header.length, ...cells.map((cell) => cell.length));
  });

  process.stdout.write(`${columns.map((column, index) => column.header.padEnd(widths[index] ?? 0)).join("  ")}\n`);
  process.stdout.write(`${widths.map((width) => "-".repeat(width)).join("  ")}\n`);
  for (const row of formattedRows) {
    process.stdout.write(`${row.map((cell, index) => cell.padEnd(widths[index] ?? 0)).join("  ")}\n`);
  }
}

function formatCell(value: unknown, max = 80) {
  const text = value === undefined || value === null ? "" : String(value);
  if (text.length <= max) {
    return text;
  }
  if (max <= 3) {
    return text.slice(0, max);
  }
  return `${text.slice(0, max - 3)}...`;
}
