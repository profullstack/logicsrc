// Identity-key fingerprints, the same everywhere: the CLI (known-keys pinning),
// the PWA pages and public/pins.js all compute sha256 over the RAW 32-byte X25519
// public key and show the first 16 bytes as eight groups of four hex digits.
// Two people comparing fingerprints out loud (or a pin noticing a change) is how
// a swapped key gets caught; the server cannot prove a key is the person's own.
import crypto from "node:crypto";

export function keyFingerprint(publicKeyB64) {
  if (typeof publicKeyB64 !== "string" || !publicKeyB64) return null;
  let raw;
  try { raw = Buffer.from(publicKeyB64, "base64"); } catch { return null; }
  if (raw.length !== 32) return null;
  const hex = crypto.createHash("sha256").update(raw).digest("hex").slice(0, 32);
  return hex.match(/.{4}/g).join(" ");
}

/** Where a request came from, for the audit trail. Behind nginx, req.ip honours trust proxy. */
export function requestOriginInfo(req) {
  if (!req) return { ip: null, userAgent: null };
  const ip = (req.ip || req.socket?.remoteAddress || "").replace(/^::ffff:/, "") || null;
  const ua = String(req.get?.("user-agent") || "").slice(0, 300) || null;
  return { ip, userAgent: ua };
}
