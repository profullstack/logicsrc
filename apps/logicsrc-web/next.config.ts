import type { NextConfig } from "next";

// The CommandBoard API (boards, tasks, plugins, /health) runs as its own
// service. In the old custom server.js it was mounted in-process; here we proxy
// those paths to it via rewrites. Our own /api routes (hire-us, oauth/coinpay,
// webhooks) are filesystem routes and match before these afterFiles rewrites.
const commandboardApiUrl = process.env.COMMANDBOARD_API_URL;

// The credentials app (apps/pwa) is also its own service, and it owns the CLI
// login flow: `logicsrc login` talks to /cli/*, and the browser half of that
// flow needs a session, which lives behind /auth/*.
//
// Proxying those paths is what lets all of it live on logicsrc.com. Pointing
// the apex at the pwa instead would take the marketing site down with it, since
// the pwa serves `/` too; a subdomain would work but needs a Railway custom
// domain and a DNS record. This needs neither, and it makes the CLI's default
// origin (https://logicsrc.com) correct as it already stands.
const credentialsAppUrl = process.env.CREDENTIALS_APP_URL;

const securityHeaders = [
  // HSTS — site is HTTPS-only behind Railway. No `preload` (irreversible).
  { key: "Strict-Transport-Security", value: "max-age=31536000; includeSubDomains" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "X-Frame-Options", value: "SAMEORIGIN" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
];

/**
 * The paths the credentials app owns.
 *
 * `/api/me` and `/api/credshare/*` are named individually, and the caller must
 * place these BEFORE the CommandBoard `/api/:path*` catch-all — otherwise the
 * catch-all swallows them and sends CLI auth to the wrong service.
 */
export function credentialsRewrites(base: string) {
  return [
    // the device-code and loopback login flows themselves
    { source: "/cli/:path*", destination: `${base}/cli/:path*` },
    // identity, and the credential-sharing API the CLI uses once logged in
    { source: "/api/me", destination: `${base}/api/me` },
    { source: "/api/credshare/:path*", destination: `${base}/api/credshare/:path*` },
    // /cli/authorize and /cli/device sit behind requireAuth, so an
    // unauthenticated visitor gets redirected here to sign in. Without this the
    // browser half of the flow dead-ends on a 404.
    { source: "/auth/:path*", destination: `${base}/auth/:path*` },
  ];
}

/** CommandBoard's paths. The `/api` entry is a catch-all, so it goes last. */
export function commandboardRewrites(base: string) {
  return [
    { source: "/health", destination: `${base}/health` },
    { source: "/api/:path*", destination: `${base}/api/:path*` },
  ];
}

/** Built as a function so the ordering above is testable without booting Next. */
export function buildRewrites(
  credentials = credentialsAppUrl,
  commandboard = commandboardApiUrl,
) {
  const afterFiles = [
    ...(credentials ? credentialsRewrites(credentials.replace(/\/$/, "")) : []),
    ...(commandboard ? commandboardRewrites(commandboard.replace(/\/$/, "")) : []),
  ];
  return afterFiles.length ? { afterFiles } : [];
}

const nextConfig: NextConfig = {
  async headers() {
    return [{ source: "/:path*", headers: securityHeaders }];
  },
  async rewrites() {
    return buildRewrites();
  },
};

export default nextConfig;
