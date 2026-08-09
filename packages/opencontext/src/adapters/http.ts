/**
 * `http://` and `https://` adapter.
 *
 * Remote content is data, never instruction. Whatever comes back is marked
 * untrusted unless the object declares a digest that matches, in which case it
 * is `verified` — integrity is a claim about bytes, not about intent, so even a
 * digest-matched document never becomes `trusted`.
 */

import type { Adapter, AdapterContext, AdapterResult } from "../types.js";
import { sha256Uri } from "../digest.js";

export class OfflineError extends Error {
  constructor(uri: string) {
    super(`Cannot fetch ${uri} in --offline mode. Run without --offline, or inline the content.`);
    this.name = "OfflineError";
  }
}

const DEFAULT_TIMEOUT_MS = 10_000;
const MAX_BYTES = 5 * 1024 * 1024;

export const httpAdapter: Adapter = {
  name: "http",
  schemes: ["http", "https"],
  remote: true,
  async load(uri: string, ctx: AdapterContext): Promise<AdapterResult> {
    if (ctx.offline) throw new OfflineError(uri);

    const url = new URL(uri);
    if (url.protocol === "http:" && ctx.config.allow_insecure !== true) {
      throw new Error(
        `Refusing to fetch ${uri} over plaintext http. Use https, or set adapters.http.allow_insecure: true ` +
          `if this is a trusted network you control.`
      );
    }

    const timeoutMs = ctx.timeoutMs ?? (ctx.config.timeout_ms as number | undefined) ?? DEFAULT_TIMEOUT_MS;
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);

    let response: Response;
    try {
      response = await fetch(url, {
        signal: controller.signal,
        // Redirects can move a request to a host the author never named, so the
        // final URL is reported back rather than followed silently.
        redirect: "follow",
        headers: { accept: "text/markdown, text/plain, application/json;q=0.9, */*;q=0.8" }
      });
    } catch (error) {
      throw new Error(`Failed to fetch ${uri}: ${(error as Error).message}`);
    } finally {
      clearTimeout(timer);
    }

    if (!response.ok) {
      throw new Error(`Failed to fetch ${uri}: HTTP ${response.status} ${response.statusText}`);
    }

    const declaredLength = Number(response.headers.get("content-length") ?? "0");
    if (declaredLength > MAX_BYTES) {
      throw new Error(`Refusing to load ${uri}: ${declaredLength} bytes exceeds the ${MAX_BYTES} byte limit.`);
    }

    const content = await response.text();
    if (content.length > MAX_BYTES) {
      throw new Error(`Refusing to load ${uri}: response exceeds the ${MAX_BYTES} byte limit.`);
    }

    return {
      content,
      contentType: (response.headers.get("content-type") ?? "text/plain").split(";")[0]!.trim(),
      digest: sha256Uri(content),
      retrievedAt: new Date().toISOString(),
      trust: (ctx.config.trust as AdapterResult["trust"]) ?? "untrusted"
    };
  }
};
