import { createReadStream, existsSync, statSync } from "node:fs";
import { createServer } from "node:http";
import { extname, join, normalize, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { createCommandBoardServer } from "../commandboard-api/dist/index.js";

const appDirectory = fileURLToPath(new URL(".", import.meta.url));
const distDirectory = resolve(appDirectory, "dist");
const indexFile = join(distDirectory, "index.html");
const apiServer = createCommandBoardServer();
const port = Number(process.env.PORT ?? 4174);

const mimeTypes = {
  ".css": "text/css; charset=utf-8",
  ".html": "text/html; charset=utf-8",
  ".ico": "image/x-icon",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".png": "image/png",
  ".svg": "image/svg+xml",
  ".webmanifest": "application/manifest+json; charset=utf-8",
  ".xml": "application/xml; charset=utf-8"
};

createServer((request, response) => {
  const url = new URL(request.url ?? "/", `http://${request.headers.host ?? "localhost"}`);

  if (url.pathname === "/api/hire-us/coinpay-checkout") {
    handleHireUsCoinPayCheckout(request, response);
    return;
  }

  if (url.pathname === "/health" || url.pathname.startsWith("/api/")) {
    apiServer.emit("request", request, response);
    return;
  }

  if (request.method !== "GET" && request.method !== "HEAD") {
    response.writeHead(405, { allow: "GET, HEAD" });
    response.end("Method not allowed");
    return;
  }

  const file = resolveStaticPath(url.pathname);
  if (!file) {
    response.writeHead(403);
    response.end("Forbidden");
    return;
  }

  sendFile(file, request.method === "HEAD", response);
}).listen(port, () => {
  console.log(`LogicSRC standards PWA listening on http://localhost:${port}`);
});

function resolveStaticPath(pathname) {
  const decodedPath = decodeURIComponent(pathname);
  const normalizedPath = normalize(decodedPath).replace(/^(\.\.[/\\])+/, "");
  let candidate = join(distDirectory, normalizedPath);

  if (!candidate.startsWith(distDirectory)) {
    return null;
  }

  if (existsSync(candidate) && statSync(candidate).isDirectory()) {
    candidate = join(candidate, "index.html");
  }

  if (existsSync(candidate) && statSync(candidate).isFile()) {
    return candidate;
  }

  return indexFile;
}

function sendFile(file, headOnly, response) {
  if (!existsSync(file)) {
    response.writeHead(500, { "content-type": "text/plain; charset=utf-8" });
    response.end("Build output missing. Run `npm run build` before `npm start`.");
    return;
  }

  const extension = extname(file);
  response.writeHead(200, {
    "cache-control": extension === ".html" || extension === ".xml" ? "no-store" : "public, max-age=31536000, immutable",
    "content-type": mimeTypes[extension] ?? "application/octet-stream"
  });

  if (headOnly) {
    response.end();
    return;
  }

  createReadStream(file).pipe(response);
}

async function handleHireUsCoinPayCheckout(request, response) {
  if (request.method !== "POST") {
    sendJson(response, 405, { success: false, error: "Method not allowed" }, { allow: "POST" });
    return;
  }

  const apiKey = process.env.COINPAY_API_KEY;
  const merchantId = process.env.COINPAY_MERCHANT_ID;
  const apiUrl = process.env.COINPAY_API_URL || "https://coinpayportal.com";
  const blockchain = process.env.COINPAY_HIRE_US_BLOCKCHAIN || "USDC_POL";

  if (!apiKey) {
    sendJson(response, 503, { success: false, error: "CoinPay checkout is not configured" });
    return;
  }

  try {
    const body = await readJson(request);
    const buyerEmail = typeof body.email === "string" ? body.email.trim().slice(0, 160) : "";
    const checkoutResponse = await fetch(new URL("/api/payments/create", apiUrl), {
      method: "POST",
      headers: {
        authorization: `Bearer ${apiKey}`,
        "content-type": "application/json"
      },
      body: JSON.stringify({
        amount: 500,
        currency: "USD",
        blockchain,
        description: "LogicSRC Hire Us - $500/week",
        metadata: {
          product: "logicsrc-hire-us",
          interval: "week",
          source: "logicsrc.com/hire-us",
          ...(merchantId ? { merchant_id: merchantId } : {}),
          ...(buyerEmail ? { buyer_email: buyerEmail } : {})
        },
        redirect_url: `${process.env.PUBLIC_URL || "https://logicsrc.com"}/hire-us?payment=coinpay`
      })
    });

    const payload = await checkoutResponse.json().catch(() => ({}));

    if (!checkoutResponse.ok || !payload.success) {
      sendJson(response, checkoutResponse.ok ? 502 : checkoutResponse.status, {
        success: false,
        error: payload.error || "CoinPay checkout failed"
      });
      return;
    }

    const payment = payload.payment || {};
    sendJson(response, 201, {
      success: true,
      payment: {
        id: payment.id,
        amount_usd: Number(payment.amount_usd ?? payment.amount ?? 500),
        currency: payment.currency ?? payment.blockchain ?? blockchain,
        crypto_amount: payment.amount_crypto ?? payment.crypto_amount ?? null,
        address: payment.payment_address ?? null,
        qr_code: payment.qr_code ?? null,
        expires_at: payment.expires_at ?? null,
        status: payment.status ?? "pending",
        checkout_url: payment.stripe_checkout_url ?? null
      }
    });
  } catch (error) {
    sendJson(response, 500, {
      success: false,
      error: error instanceof Error ? error.message : "Unable to create CoinPay checkout"
    });
  }
}

function readJson(request) {
  return new Promise((resolve, reject) => {
    let body = "";
    request.setEncoding("utf8");
    request.on("data", (chunk) => {
      body += chunk;
      if (body.length > 4096) {
        reject(new Error("Request body too large"));
        request.destroy();
      }
    });
    request.on("end", () => {
      if (!body.trim()) {
        resolve({});
        return;
      }
      try {
        resolve(JSON.parse(body));
      } catch {
        reject(new Error("Invalid JSON"));
      }
    });
    request.on("error", reject);
  });
}

function sendJson(response, status, body, headers = {}) {
  response.writeHead(status, {
    "cache-control": "no-store",
    "content-type": "application/json; charset=utf-8",
    ...headers
  });
  response.end(JSON.stringify(body));
}
