// Which origin to hand back to a caller.
//
// `config.origin` comes from $PUBLIC_ORIGIN and is a single fixed value, so any
// response that echoes it is wrong the moment the app is reachable on more than
// one hostname — that is how `logicsrc login` ended up printing a generated
// Railway hostname to users on the real domain. For URLs we hand back to the
// caller, derive the origin from the request instead: whatever host the client
// reached us on is the host it should be sent back to.
//
// Express honours X-Forwarded-Proto/X-Forwarded-Host here because server.mjs
// sets `trust proxy` behind Railway's TLS terminator.
//
// NOT for security decisions. The WebAuthn `expectedOrigin` in passkey.mjs must
// stay pinned to config.origin — validating a signature against a host the
// caller supplied would defeat the check.

/**
 * The origin this request arrived on (`https://logicsrc.com`), falling back to
 * the configured origin when there is no Host header (HTTP/1.0, direct socket).
 *
 * @param {{ protocol?: string, get?: (h: string) => string | undefined, headers?: Record<string, unknown> }} req
 * @param {string} fallback - config.origin
 * @returns {string} origin with no trailing slash
 */
export function requestOrigin(req, fallback) {
  const host = req?.get?.("host") || req?.headers?.host;
  if (!host) return String(fallback || "").replace(/\/+$/, "");
  const protocol = req?.protocol || "https";
  return `${protocol}://${host}`.replace(/\/+$/, "");
}
