import type { FeedDiscoveryConfig } from "./types.js";
import { assertSafeHttpUrl } from "./url-safety.js";

export interface BoundedFetchResult {
  url: string;
  contentType: string;
  body: string;
  status: number;
}

export async function fetchTextWithGuards(input: string, config: Pick<FeedDiscoveryConfig, "requestTimeoutMs" | "maxBodyBytes" | "userAgent">, redirects = 3): Promise<BoundedFetchResult> {
  const url = await assertSafeHttpUrl(input);
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), config.requestTimeoutMs);

  try {
    const response = await fetch(url, {
      redirect: "manual",
      signal: controller.signal,
      headers: {
        "user-agent": config.userAgent,
        accept: "application/rss+xml, application/atom+xml, application/feed+json, application/json, text/xml, application/xml, text/html;q=0.8, */*;q=0.5"
      }
    });

    if (isRedirect(response.status)) {
      if (redirects <= 0) {
        throw new Error("Too many redirects");
      }
      const location = response.headers.get("location");
      if (!location) {
        throw new Error("Redirect without location");
      }
      return fetchTextWithGuards(new URL(location, url).toString(), config, redirects - 1);
    }

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }

    const body = await readLimitedText(response, config.maxBodyBytes);
    return {
      url: response.url || url.toString(),
      contentType: response.headers.get("content-type") ?? "",
      body,
      status: response.status
    };
  } finally {
    clearTimeout(timeout);
  }
}

async function readLimitedText(response: Response, maxBodyBytes: number) {
  if (!response.body) {
    return response.text();
  }

  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let received = 0;

  while (true) {
    const { done, value } = await reader.read();
    if (done) {
      break;
    }
    received += value.byteLength;
    if (received > maxBodyBytes) {
      await reader.cancel();
      throw new Error(`Response exceeded ${maxBodyBytes} bytes`);
    }
    chunks.push(value);
  }

  return new TextDecoder().decode(Buffer.concat(chunks));
}

function isRedirect(status: number) {
  return status === 301 || status === 302 || status === 303 || status === 307 || status === 308;
}
