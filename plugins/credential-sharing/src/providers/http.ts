/** Minimal fetch helper shared by the network credential providers. */
export function requireEnv(name: string, hint: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing ${name}. ${hint}`);
  }
  return value;
}

export async function httpJson<T>(
  url: string,
  init: RequestInit & { expect?: string } = {}
): Promise<T> {
  const response = await fetch(url, init);
  if (!response.ok) {
    const body = await response.text().catch(() => "");
    throw new Error(`${init.expect ?? "Request"} failed: ${response.status} ${response.statusText} ${body.slice(0, 300)}`.trim());
  }
  if (response.status === 204) {
    return undefined as T;
  }
  return (await response.json()) as T;
}
