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
