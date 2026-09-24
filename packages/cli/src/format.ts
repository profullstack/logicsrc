export type OutputFormat = "json" | "table" | "markdown";

export function print(data: unknown, format: OutputFormat) {
  if (format === "json") {
    console.log(JSON.stringify(data, null, 2));
    return;
  }

  if (format === "markdown") {
    if (Array.isArray(data)) {
      for (const item of data) {
        console.log(`- ${Object.entries(item as Record<string, unknown>).map(([key, value]) => `**${key}:** ${String(value)}`).join(", ")}`);
      }
      return;
    }

    console.log(Object.entries(data as Record<string, unknown>).map(([key, value]) => `**${key}:** ${String(value)}`).join("\n"));
    return;
  }

  console.table(data);
}

/**
 * A plain, aligned table: no index column, no quotes, no colour. Easier to read
 * than console.table and pipes cleanly into grep, sort and awk.
 */
export function printColumns(rows: Array<Record<string, unknown>>): void {
  if (rows.length === 0) return;
  const headers = Object.keys(rows[0]!);
  const cells = rows.map((row) => headers.map((h) => String(row[h] ?? "")));
  const widths = headers.map((h, i) => Math.max(h.length, ...cells.map((c) => c[i]!.length)));
  const line = (values: string[]) =>
    values.map((v, i) => (i === values.length - 1 ? v : v.padEnd(widths[i]!))).join("  ").trimEnd();
  console.log(line(headers.map((h) => h.toUpperCase())));
  for (const c of cells) console.log(line(c));
}
