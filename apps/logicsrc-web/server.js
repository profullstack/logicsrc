import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import { createReadStream, existsSync, readFileSync, statSync } from "node:fs";
import { createServer } from "node:http";
import { extname, join, normalize, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { createCommandBoardServer } from "../commandboard-api/dist/index.js";

const appDirectory = fileURLToPath(new URL(".", import.meta.url));
const distDirectory = resolve(appDirectory, "dist");
const indexFile = join(distDirectory, "index.html");
loadLocalEnv(resolve(appDirectory, "../..", ".env"));
const apiServer = createCommandBoardServer();
const port = Number(process.env.PORT ?? 4174);
const coinPayOAuthStateCookie = "logicsrc_coinpay_oauth_state";
const coinPaySessionCookie = "logicsrc_coinpay_session";

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

  if (url.pathname === "/api/oauth/coinpay/start") {
    handleCoinPayOAuthStart(request, response);
    return;
  }

  if (url.pathname === "/api/oauth/coinpay/callback") {
    handleCoinPayOAuthCallback(request, response, url);
    return;
  }

  if (url.pathname === "/api/oauth/coinpay/session") {
    handleCoinPayOAuthSession(request, response);
    return;
  }

  if (url.pathname === "/api/hire-us/project-request") {
    handleHireUsProjectRequest(request, response);
    return;
  }

  if (url.pathname === "/api/webhooks/coinpay") {
    handleCoinPayWebhook(request, response);
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
  const eligibilityApiKey = process.env.COINPAY_ELIGIBILITY_API_KEY || process.env.COINPAY_AGENT_API_KEY || apiKey;
  const businessId = process.env.COINPAY_BUSINESS_ID || process.env.COINPAY_MERCHANT_ID;
  const eligibilityMerchantId = process.env.COINPAY_ELIGIBILITY_MERCHANT_ID || process.env.COINPAY_MERCHANT_ID;
  const apiUrl = process.env.COINPAY_API_URL || "https://coinpayportal.com";
  const blockchain = process.env.COINPAY_HIRE_US_BLOCKCHAIN || "USDC_POL";
  const publicUrl = process.env.PUBLIC_URL || "https://logicsrc.com";

  if (!apiKey || !businessId) {
    sendJson(response, 503, { success: false, error: "CoinPay checkout is not configured" });
    return;
  }

  try {
    const body = await readJson(request);
    const buyerEmail = typeof body.email === "string" ? body.email.trim().slice(0, 160) : "";
    const eligibility = await fetchMerchantEligibility(apiUrl, eligibilityApiKey, eligibilityMerchantId);
    const paymentRail = choosePaymentRail(eligibility, blockchain);

    if (!paymentRail) {
      sendJson(response, 503, {
        success: false,
        error: "CoinPay checkout is not available for this merchant"
      });
      return;
    }

    const checkoutResponse = await fetch(new URL("/api/payments/create", apiUrl), {
      method: "POST",
      headers: {
        authorization: `Bearer ${apiKey}`,
        "content-type": "application/json"
      },
      body: JSON.stringify({
        business_id: businessId,
        amount_usd: 250,
        payment_method: paymentRail.method,
        currency: paymentRail.currency,
        ...(paymentRail.blockchain ? { blockchain: paymentRail.blockchain } : {}),
        description: "LogicSRC Hire Us - $250/week",
        success_url: `${publicUrl}/hire-us?payment=success`,
        cancel_url: `${publicUrl}/hire-us?payment=cancelled`,
        redirect_url: `${publicUrl}/hire-us?payment=coinpay`,
        webhook_url: `${publicUrl}/api/webhooks/coinpay`,
        metadata: {
          product: "logicsrc-hire-us",
          interval: "week",
          source: "logicsrc.com/hire-us",
          ...(buyerEmail ? { buyer_email: buyerEmail } : {})
        }
      })
    });

    const responseText = await checkoutResponse.text();
    const payload = parseJson(responseText);

    if (!checkoutResponse.ok || !payload.success) {
      console.error("[coinpay] checkout create failed", {
        status: checkoutResponse.status,
        error: payload.error || responseText.slice(0, 300)
      });
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
        amount_usd: Number(payment.amount_usd ?? payment.amount ?? 250),
        payment_method: payment.stripe_checkout_url ? "card" : paymentRail.method,
        currency: payment.currency ?? payment.blockchain ?? paymentRail.blockchain ?? paymentRail.currency,
        crypto_amount: payment.amount_crypto ?? payment.crypto_amount ?? null,
        address: payment.payment_address ?? null,
        qr_code: payment.qr_code ?? null,
        expires_at: payment.expires_at ?? null,
        status: payment.status ?? "pending",
        checkout_url: payment.stripe_checkout_url ?? payload.checkout_url ?? payment.checkout_url ?? null
      }
    });
  } catch (error) {
    console.error("[coinpay] checkout request failed", error);
    sendJson(response, 500, {
      success: false,
      error: "Unable to reach CoinPay checkout"
    });
  }
}

function handleCoinPayOAuthStart(request, response) {
  if (request.method !== "GET") {
    sendJson(response, 405, { success: false, error: "Method not allowed" }, { allow: "GET" });
    return;
  }

  const config = getCoinPayOAuthConfig();
  if (!config) {
    sendJson(response, 503, { success: false, error: "CoinPay OAuth is not configured" });
    return;
  }

  const state = randomBytes(16).toString("hex");
  const authorizeUrl = new URL("/api/oauth/authorize", config.issuer);
  authorizeUrl.searchParams.set("response_type", "code");
  authorizeUrl.searchParams.set("client_id", config.clientId);
  authorizeUrl.searchParams.set("redirect_uri", config.redirectUri);
  authorizeUrl.searchParams.set("scope", config.scopes);
  authorizeUrl.searchParams.set("state", state);

  response.writeHead(302, {
    location: authorizeUrl.toString(),
    "set-cookie": serializeCookie(coinPayOAuthStateCookie, state, {
      maxAge: 600,
      path: "/api/oauth/coinpay"
    })
  });
  response.end();
}

async function handleCoinPayOAuthCallback(request, response, url) {
  if (request.method !== "GET") {
    sendJson(response, 405, { success: false, error: "Method not allowed" }, { allow: "GET" });
    return;
  }

  const config = getCoinPayOAuthConfig();
  if (!config) {
    sendJson(response, 503, { success: false, error: "CoinPay OAuth is not configured" });
    return;
  }

  const callbackError = url.searchParams.get("error");
  if (callbackError) {
    redirectWithOAuthStatus(response, "error", callbackError);
    return;
  }

  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");
  const expectedState = parseCookies(request.headers.cookie)[coinPayOAuthStateCookie];

  if (!code) {
    redirectWithOAuthStatus(response, "error", "missing_code");
    return;
  }

  if (!state || !expectedState || state !== expectedState) {
    redirectWithOAuthStatus(response, "error", "invalid_state");
    return;
  }

  try {
    const tokenResponse = await fetch(new URL("/api/oauth/token", config.issuer), {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        grant_type: "authorization_code",
        code,
        redirect_uri: config.redirectUri,
        client_id: config.clientId,
        client_secret: config.clientSecret
      })
    });
    const tokenText = await tokenResponse.text();
    const tokenPayload = parseJson(tokenText);

    if (!tokenResponse.ok || typeof tokenPayload.access_token !== "string") {
      console.error("[coinpay-oauth] token exchange failed", {
        status: tokenResponse.status,
        error: tokenPayload.error || tokenText.slice(0, 160)
      });
      redirectWithOAuthStatus(response, "error", "token_exchange_failed");
      return;
    }

    const userResponse = await fetch(new URL("/api/oauth/userinfo", config.issuer), {
      headers: { authorization: `Bearer ${tokenPayload.access_token}` }
    });
    const userText = await userResponse.text();
    const userInfo = userResponse.ok ? parseJson(userText) : {};

    const session = signSession({
      provider: "coinpay",
      sub: typeof userInfo.sub === "string" ? userInfo.sub : null,
      email: typeof userInfo.email === "string" ? userInfo.email : null,
      name: typeof userInfo.name === "string" ? userInfo.name : null,
      scope: typeof tokenPayload.scope === "string" ? tokenPayload.scope : config.scopes,
      connected_at: new Date().toISOString()
    });

    response.writeHead(302, {
      location: "/?coinpay_oauth=connected",
      "set-cookie": [
        serializeCookie(coinPaySessionCookie, session, { maxAge: 60 * 60 * 24 * 30, path: "/" }),
        serializeCookie(coinPayOAuthStateCookie, "", { maxAge: 0, path: "/api/oauth/coinpay" })
      ]
    });
    response.end();
  } catch (error) {
    console.error("[coinpay-oauth] callback failed", error);
    redirectWithOAuthStatus(response, "error", "callback_failed");
  }
}

function handleCoinPayOAuthSession(request, response) {
  if (request.method !== "GET") {
    sendJson(response, 405, { success: false, error: "Method not allowed" }, { allow: "GET" });
    return;
  }

  const sessionCookie = parseCookies(request.headers.cookie)[coinPaySessionCookie];
  const session = sessionCookie ? verifySession(sessionCookie) : null;
  sendJson(response, 200, {
    authenticated: !!session,
    user: session
      ? {
          provider: session.provider,
          sub: session.sub,
          email: session.email,
          name: session.name,
          scope: session.scope,
          connected_at: session.connected_at
        }
      : null
  });
}

async function handleHireUsProjectRequest(request, response) {
  if (request.method !== "POST") {
    sendJson(response, 405, { success: false, error: "Method not allowed" }, { allow: "POST" });
    return;
  }

  try {
    const body = await readJson(request);
    const contact = typeof body.contact === "string" ? body.contact.trim().slice(0, 160) : "";
    const project = typeof body.project === "string" ? body.project.trim().slice(0, 4000) : "";

    if (!contact || project.length < 20) {
      sendJson(response, 422, {
        success: false,
        error: "Contact and a project description are required"
      });
      return;
    }

    const requestId = `hire_${Date.now()}`;
    console.log("[hire-us] project request received", {
      id: requestId,
      contact,
      project_length: project.length,
      plan: "250/week",
      invoice: "pending_acceptance"
    });

    sendJson(response, 202, {
      success: true,
      request: {
        id: requestId,
        status: "pending_acceptance",
        amount_usd: 250,
        interval: "week",
        invoice: "created_after_acceptance"
      }
    });
  } catch (error) {
    console.error("[hire-us] project request failed", error);
    sendJson(response, 500, { success: false, error: "Unable to submit project request" });
  }
}

async function handleCoinPayWebhook(request, response) {
  if (request.method !== "POST") {
    sendJson(response, 405, { success: false, error: "Method not allowed" }, { allow: "POST" });
    return;
  }

  const webhookSecret = process.env.COINPAY_WEBHOOK_SECRET;
  if (!webhookSecret) {
    sendJson(response, 503, { success: false, error: "CoinPay webhook is not configured" });
    return;
  }

  const rawBody = await readText(request);
  const signature = request.headers["x-coinpay-signature"];
  const signatureHeader = Array.isArray(signature) ? signature[0] : signature;
  if (!verifyCoinPayWebhook(rawBody, signatureHeader, webhookSecret)) {
    sendJson(response, 401, { success: false, error: "Invalid signature" });
    return;
  }

  const payload = parseJson(rawBody);
  const paymentId = payload?.data?.payment_id ?? payload?.payment_id ?? null;
  const complete = payload?.type === "payment.confirmed" || payload?.type === "payment.forwarded";

  console.log("[coinpay] webhook received", {
    type: payload?.type ?? null,
    payment_id: paymentId,
    complete
  });

  sendJson(response, 200, {
    received: true,
    complete,
    payment_id: paymentId
  });
}

async function fetchMerchantEligibility(apiUrl, apiKey, merchantId) {
  if (!merchantId) {
    return null;
  }

  try {
    const url = new URL("/api/payments/merchant-eligibility", apiUrl);
    url.searchParams.set("merchant_id", merchantId);
    const response = await fetch(url, {
      headers: { authorization: `Bearer ${apiKey}` }
    });
    const text = await response.text();
    const payload = parseJson(text);

    if (!response.ok || !payload.success) {
      console.warn("[coinpay] merchant eligibility unavailable", {
        status: response.status,
        error: payload.error || text.slice(0, 120)
      });
      return null;
    }

    return {
      accepts_card: payload.accepts_card === true,
      accepts_crypto: payload.accepts_crypto === true,
      chains: Array.isArray(payload.chains) ? payload.chains.filter((chain) => typeof chain === "string") : []
    };
  } catch (error) {
    console.warn("[coinpay] merchant eligibility request failed", error);
    return null;
  }
}

function choosePaymentRail(eligibility, configuredBlockchain) {
  const cryptoCurrency = configuredBlockchain.toLowerCase();

  if (!eligibility) {
    return { method: "both", currency: cryptoCurrency, blockchain: configuredBlockchain };
  }

  const configuredChainAvailable = eligibility.chains
    .map((chain) => chain.toUpperCase())
    .includes(configuredBlockchain.toUpperCase());
  const acceptsConfiguredCrypto = eligibility.accepts_crypto && configuredChainAvailable;

  if (eligibility.accepts_card && acceptsConfiguredCrypto) {
    return { method: "both", currency: cryptoCurrency, blockchain: configuredBlockchain };
  }

  if (eligibility.accepts_card) {
    return { method: "card", currency: "card", blockchain: null };
  }

  if (acceptsConfiguredCrypto) {
    return { method: "crypto", currency: cryptoCurrency, blockchain: configuredBlockchain };
  }

  return null;
}

function verifyCoinPayWebhook(rawBody, signatureHeader, secret) {
  if (!signatureHeader) {
    return false;
  }

  try {
    const parts = signatureHeader.split(",");
    const timestamp = parts.find((part) => part.startsWith("t="))?.slice(2);
    const signature = parts.find((part) => part.startsWith("v1="))?.slice(3);
    if (!timestamp || !signature) {
      return false;
    }

    const timestampSeconds = Number.parseInt(timestamp, 10);
    if (!Number.isFinite(timestampSeconds) || Math.abs(Math.floor(Date.now() / 1000) - timestampSeconds) > 300) {
      return false;
    }

    const expected = createHmac("sha256", secret).update(`${timestamp}.${rawBody}`).digest("hex");
    const actualBuffer = Buffer.from(signature, "hex");
    const expectedBuffer = Buffer.from(expected, "hex");
    return actualBuffer.length === expectedBuffer.length && timingSafeEqual(actualBuffer, expectedBuffer);
  } catch {
    return false;
  }
}

function getCoinPayOAuthConfig() {
  const clientId = process.env.COINPAY_OAUTH_CLIENT_ID;
  const clientSecret = process.env.COINPAY_OAUTH_CLIENT_SECRET;
  const redirectUri = process.env.COINPAY_OAUTH_REDIRECT_URI;
  const issuer = process.env.COINPAY_OAUTH_ISSUER || process.env.COINPAY_API_URL || "https://coinpayportal.com";
  const scopes = process.env.COINPAY_OAUTH_SCOPES || "openid profile email";

  if (!clientId || !clientSecret || !redirectUri) {
    return null;
  }

  return { clientId, clientSecret, redirectUri, issuer, scopes };
}

function redirectWithOAuthStatus(response, status, error) {
  const location = new URL("/", process.env.PUBLIC_URL || "https://logicsrc.com");
  location.searchParams.set("coinpay_oauth", status);
  if (error) {
    location.searchParams.set("error", error);
  }

  response.writeHead(302, { location: `${location.pathname}${location.search}` });
  response.end();
}

function serializeCookie(name, value, options = {}) {
  const parts = [
    `${name}=${encodeURIComponent(value)}`,
    "HttpOnly",
    "SameSite=Lax",
    `Path=${options.path || "/"}`
  ];

  if (typeof options.maxAge === "number") {
    parts.push(`Max-Age=${options.maxAge}`);
  }

  if ((process.env.PUBLIC_URL || "").startsWith("https://")) {
    parts.push("Secure");
  }

  return parts.join("; ");
}

function parseCookies(header) {
  if (!header) return {};
  return Object.fromEntries(
    header
      .split(";")
      .map((cookie) => cookie.trim())
      .filter(Boolean)
      .map((cookie) => {
        const separator = cookie.indexOf("=");
        if (separator === -1) return [cookie, ""];
        return [
          cookie.slice(0, separator),
          decodeURIComponent(cookie.slice(separator + 1))
        ];
      })
  );
}

function signSession(payload) {
  const encoded = Buffer.from(JSON.stringify(payload)).toString("base64url");
  const signature = createHmac("sha256", getSessionSecret()).update(encoded).digest("base64url");
  return `${encoded}.${signature}`;
}

function verifySession(value) {
  const [encoded, signature] = value.split(".");
  if (!encoded || !signature) return null;

  const expected = createHmac("sha256", getSessionSecret()).update(encoded).digest("base64url");
  const actualBuffer = Buffer.from(signature);
  const expectedBuffer = Buffer.from(expected);
  if (actualBuffer.length !== expectedBuffer.length || !timingSafeEqual(actualBuffer, expectedBuffer)) {
    return null;
  }

  try {
    return JSON.parse(Buffer.from(encoded, "base64url").toString("utf8"));
  } catch {
    return null;
  }
}

function getSessionSecret() {
  return process.env.LOGICSRC_SESSION_SECRET || process.env.COINPAY_OAUTH_CLIENT_SECRET || "logicsrc-dev-session-secret";
}

function loadLocalEnv(file) {
  if (!existsSync(file)) return;

  for (const line of readFileSync(file, "utf8").split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;

    const separator = trimmed.indexOf("=");
    if (separator === -1) continue;

    const key = trimmed.slice(0, separator).trim();
    const rawValue = trimmed.slice(separator + 1).trim();
    if (!key || process.env[key] !== undefined) continue;

    process.env[key] = rawValue.replace(/^(['"])(.*)\1$/, "$2");
  }
}

function parseJson(text) {
  try {
    return text ? JSON.parse(text) : {};
  } catch {
    return {};
  }
}

function readText(request) {
  return new Promise((resolve, reject) => {
    let body = "";
    request.setEncoding("utf8");
    request.on("data", (chunk) => {
      body += chunk;
      if (body.length > 65536) {
        reject(new Error("Request body too large"));
        request.destroy();
      }
    });
    request.on("end", () => resolve(body));
    request.on("error", reject);
  });
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
