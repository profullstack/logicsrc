// LogicSRC credentials — Express PWA entrypoint (auth + team credential sharing).
import express from "express";
import cookieParser from "cookie-parser";
import path from "node:path";
import { createRequire } from "node:module";
import { config } from "./config.mjs";
import { migrate } from "./migrate.mjs";
import { sessionMiddleware, csrfGuard } from "./lib/session.mjs";
import { authRouter } from "./routes/auth.mjs";
import { passkeyRouter } from "./routes/passkey.mjs";
import { coinpayRouter } from "./routes/coinpay.mjs";
import { credshareRouter } from "./routes/credshare.mjs";
import { rotationRouter } from "./routes/rotation.mjs";
import { autoRotationRouter } from "./routes/auto-rotation.mjs";
import { sweepAutoRotation } from "./lib/auto-rotation.mjs";
import { apiKeysRouter } from "./routes/apikeys.mjs";
import { opencredsRouter } from "./routes/opencreds.mjs";
import { keyringRouter } from "./routes/keyring.mjs";
import { keyringShareRouter, publicKeysRouter } from "./routes/keyring-share.mjs";
import { cliRouter } from "./routes/cli.mjs";
import { pagesRouter } from "./routes/pages.mjs";
import { profileRouter } from "./lib/profile.mjs";
import { descriptor } from "@profullstack/footer";
import { RING_FOOTER_OPTIONS } from "./lib/ring-footer.mjs";
import { securityHeaders } from "./lib/security-headers.mjs";
import { PROFILE_ENHANCE_SCRIPT } from "@profullstack/profile";

const app = express();
app.disable("x-powered-by");
if (config.secure) app.set("trust proxy", 1); // Railway terminates TLS

// Security headers on every response (CSP with no inline or third-party script,
// HSTS, no framing, no referrer). See lib/security-headers.mjs.
app.use(securityHeaders);

// body parsing — keep the raw body for HMAC signature verification
// A vault push carries hundreds of encrypted items; parse it under a larger cap
// first. The global parser below skips a body that is already parsed.
app.use("/api/opencreds", express.json({ limit: "10mb" }));
app.use(express.json({ verify: (req, _res, buf) => { req.rawBody = buf.toString("utf8"); } }));
app.use(express.urlencoded({ extended: false }));
app.use(cookieParser());

// static
app.use(express.static(path.join(config.root, "public"), { maxAge: "1h" }));
const requireHere = createRequire(import.meta.url);
// the @simplewebauthn/browser UMD bundle, served from node_modules (no CDN).
// Resolved, not joined onto apps/pwa/node_modules: the workspace install hoists
// it to the repo root, and the joined path 500ed (ENOENT) on every sign-in page.
// The package exports only ".", so find its root from the resolved entry
// (script/index.js) rather than resolving the bundle subpath.
const webauthnBundle = path.join(
  path.dirname(path.dirname(requireHere.resolve("@simplewebauthn/browser"))),
  "dist/bundle/index.umd.min.js",
);
app.get("/vendor/simplewebauthn-browser.umd.js", (_req, res) => res.sendFile(webauthnBundle));
// libsodium for in-browser vault decryption (public/vault.js). Same two files
// the CLI loads; resolved, not path-joined, so a hoisted workspace install works.
// Load order on the page: libsodium.js (window.libsodium) then the wrappers (window.sodium).
const sodiumWrappers = requireHere.resolve("libsodium-wrappers");
const sodiumCore = createRequire(sodiumWrappers).resolve("libsodium");
app.get("/vendor/libsodium.js", (_req, res) => res.sendFile(sodiumCore));
app.get("/vendor/libsodium-wrappers.js", (_req, res) => res.sendFile(sodiumWrappers));
// The signup profile's progressive enhancement, as a file: the CSP allows no inline script.
app.get("/vendor/profile-enhance.js", (_req, res) => res.type("application/javascript").set("Cache-Control", "public, max-age=3600").send(PROFILE_ENHANCE_SCRIPT));

// The Profullstack webring descriptor (the ring footer is on the sign-in page, /).
app.get("/.well-known/openwebring.json", (_req, res) =>
  res.json(descriptor({ site: RING_FOOTER_OPTIONS.site, name: "LogicSRC credentials" })));

app.get("/healthz", (_req, res) => res.json({ ok: true, env: config.env }));

// The keyring share link (/k/<token>.json|.keys): public, CORS-open, no session
// (mounted before the session middleware so it never sets a cookie on a cacheable answer).
app.use(publicKeysRouter);

app.use(sessionMiddleware);
app.use(csrfGuard);

// routes
app.use(authRouter);      // GET / (+ /auth/login|register|logout)
app.use(passkeyRouter);
app.use(coinpayRouter);
app.use(credshareRouter); // /api/credshare/* (session or lsk_ Bearer)
app.use(autoRotationRouter); // paid automatic rotation: CoinPay checkout + /api/coinpay/webhook
app.use(rotationRouter);  // /api/credshare/teams/:slug/rotation* + /teams/:slug/rotation (plan + run queue, never values)
app.use(apiKeysRouter);   // /api/keys (session or a person's lsk_ key; never a machine key)
app.use(opencredsRouter); // /api/opencreds/* — personal vault sync (session or lsk_ Bearer)
app.use(keyringShareRouter); // /api/keyring/share: the public-keys share link (session or person key)
app.use(keyringRouter);   // /api/keyring/* + /keyring — SSH keys / key pairs, ciphertext only
app.use(cliRouter);       // /cli/authorize, /cli/token, /api/me
app.use(profileRouter);   // /api/v1/me/profile (session cookie)
app.use(pagesRouter);     // /dashboard, /teams/*, /settings

app.use((req, res) => res.status(404).type("html").send(
  `<body style="background:#f6f7f4;color:#101418;font-family:system-ui,sans-serif;padding:14vh 24px;text-align:center"><h1 style="color:#0a7d59">404</h1><p>no such page.</p><a style="color:#0a7d59" href="/">back to your teams →</a></body>`));

// eslint-disable-next-line no-unused-vars
app.use((err, _req, res, _next) => {
  console.error(err);
  res.status(500).type("html").send(`<body style="background:#f6f7f4;color:#c23a3a;font-family:system-ui,sans-serif;padding:14vh 24px;text-align:center"><h1>500</h1><p>something broke.</p></body>`);
});

async function main() {
  await migrate();
  app.listen(config.port, () => console.log(`🔐 logicsrc credentials on :${config.port} (${config.env}) — ${config.origin}`));
  // Paid automatic rotation: switch off lapsed teams, email renewal notices. Hourly.
  const sweep = () => sweepAutoRotation().then((r) => (r.expired.length || r.reminded.length) && console.log("auto-rotation sweep", JSON.stringify(r))).catch((e) => console.error("auto-rotation sweep failed:", e.message));
  setTimeout(sweep, 60_000).unref();
  setInterval(sweep, 60 * 60 * 1000).unref();
}
main().catch((e) => { console.error("boot failed:", e); process.exit(1); });

export { app };
