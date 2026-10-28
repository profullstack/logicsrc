// Security headers for app.logicsrc.com.
//
// The vault page decrypts in the browser with the member's identity secret key,
// which can sit in sessionStorage/localStorage for the whole origin. So no page
// on this origin may run script we did not ship: scripts come from 'self' only
// (no inline <script>, no event-handler attributes, no CDN), and the page cannot
// be framed. Styles stay 'unsafe-inline' (the views use style attributes); CSS
// cannot read storage.
//
// form-action allows the CLI's loopback login redirect (http://127.0.0.1:<port>)
// and the shared footer's newsletter form (pit.world).
export const CSP = [
  "default-src 'self'",
  "script-src 'self' 'wasm-unsafe-eval'",
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: https:",
  "font-src 'self' data:",
  "connect-src 'self'",
  "worker-src 'self'",
  "manifest-src 'self'",
  "object-src 'none'",
  "base-uri 'none'",
  "frame-src 'none'",
  "frame-ancestors 'none'",
  "form-action 'self' http://127.0.0.1:* http://localhost:* https://pit.world"
].join("; ");

export function securityHeaders(req, res, next) {
  res.set("Content-Security-Policy", CSP);
  res.set("Strict-Transport-Security", "max-age=63072000; includeSubDomains");
  res.set("X-Frame-Options", "DENY");
  res.set("X-Content-Type-Options", "nosniff");
  res.set("Referrer-Policy", "no-referrer");
  res.set("Cross-Origin-Opener-Policy", "same-origin");
  res.set("Cross-Origin-Resource-Policy", "same-origin");
  res.set("Permissions-Policy", "camera=(), microphone=(), geolocation=(), payment=(), usb=(), interest-cohort=()");
  // Nothing an authenticated page or API answer says should outlive the tab.
  if (req.path.startsWith("/api/") || req.path.startsWith("/teams") || req.path.startsWith("/settings") || req.path.startsWith("/dashboard") || req.path.startsWith("/cli/")) {
    res.set("Cache-Control", "no-store");
  }
  next();
}
