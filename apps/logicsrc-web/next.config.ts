import type { NextConfig } from "next";
import { docSlugs } from "./src/lib/specs";

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
  // OpenProfile.md and OpenStack.md discovery for responses that are not HTML
  // (feeds, JSON, the specs as Markdown): the same relations the root layout
  // puts in <head>.
  {
    key: "Link",
    value: [
      `<${(process.env.PUBLIC_URL ?? "https://logicsrc.com").replace(/\/$/, "")}/.well-known/openprofile.md>; rel="openprofile"`,
      `<${(process.env.PUBLIC_URL ?? "https://logicsrc.com").replace(/\/$/, "")}/.well-known/openstack.md>; rel="openstack"`,
    ].join(", "),
  },
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

/**
 * Paths that moved. `/agent-swarm` was the AgentSwarm "coming soon" band on
 * the home page; the spec it promised is OpenFleet, which has its own landing
 * page. Permanent, so the old URL in the sitemap and in links keeps working.
 */
const REPO_DOCS = "https://github.com/profullstack/logicsrc/blob/master/docs";

export function buildRedirects() {
  return [
    { source: "/agent-swarm", destination: "/openfleet", permanent: true },
    { source: "/openprofile/skills", destination: "/openskill", permanent: true },
    // OpenI18n and OpenL10n have a specification text and no landing page.
    { source: "/openi18n", destination: "/docs/openi18n", permanent: true },
    { source: "/openl10n", destination: "/docs/openl10n", permanent: true },
    // The docs link each other as Markdown files (`./credential-sharing.md`,
    // `./opencreds/spec.md`), which resolved under /docs/ and 404ed. The pages
    // now rewrite those links; these keep the URLs already crawled working.
    // A doc the site serves goes to its page, anything else to the file in
    // the public repository.
    { source: `/docs/:slug(${docSlugs().join("|")})\\.md`, destination: "/docs/:slug", permanent: true },
    { source: "/docs/:path([a-z0-9][a-z0-9/-]*)\\.md", destination: `${REPO_DOCS}/:path.md`, permanent: true }
  ];
}

const nextConfig: NextConfig = {
  async headers() {
    return [{ source: "/:path*", headers: securityHeaders }];
  },
  async rewrites() {
    return buildRewrites();
  },
  async redirects() {
    return buildRedirects();
  },
};

export default nextConfig;
