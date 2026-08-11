export function parseBoundedIntegerParam(
  value: string | null,
  fallback: number,
  minimum: number,
  maximum: number
): number {
  const text = value?.trim() ?? "";
  if (!/^\d+$/.test(text)) return fallback;

  const parsed = Number(text);
  if (!Number.isSafeInteger(parsed) || parsed < minimum) return fallback;
  return Math.min(parsed, maximum);
}
