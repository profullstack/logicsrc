// `logicsrc login --device` printed a generated Railway hostname to users on the
// real domain, because /cli/device/code echoed $PUBLIC_ORIGIN instead of the host
// the CLI had just called. These pin the replacement behaviour.
import assert from "node:assert/strict";
import test from "node:test";

import { requestOrigin } from "../src/lib/origin.mjs";

/** A minimal stand-in for the Express request surface requestOrigin touches. */
const req = (host, protocol = "https") => ({
  protocol,
  headers: { host },
  get: (h) => (h.toLowerCase() === "host" ? host : undefined),
});

const FALLBACK = "https://logicsrc-credentials-production.up.railway.app";

test("uses the host the caller actually reached", () => {
  assert.equal(requestOrigin(req("logicsrc.com"), FALLBACK), "https://logicsrc.com");
  // The same deployment answering on its Railway hostname still self-describes
  // correctly — this is not a hardcode swap, it follows the request.
  assert.equal(
    requestOrigin(req("logicsrc-credentials-production.up.railway.app"), FALLBACK),
    FALLBACK,
  );
});

test("keeps the forwarded protocol and any explicit port", () => {
  assert.equal(requestOrigin(req("localhost:8080", "http"), FALLBACK), "http://localhost:8080");
});

test("falls back to the configured origin when there is no Host header", () => {
  assert.equal(requestOrigin({ protocol: "https" }, FALLBACK), FALLBACK);
  assert.equal(requestOrigin({}, `${FALLBACK}/`), FALLBACK, "trailing slash is trimmed");
});

test("reads the header directly when req.get is unavailable", () => {
  // Some middleware stacks (and our own tests) pass a bare object.
  assert.equal(
    requestOrigin({ protocol: "https", headers: { host: "logicsrc.com" } }, FALLBACK),
    "https://logicsrc.com",
  );
});

test("defaults to https when the request carries no protocol", () => {
  assert.equal(requestOrigin({ headers: { host: "logicsrc.com" } }, FALLBACK), "https://logicsrc.com");
});
