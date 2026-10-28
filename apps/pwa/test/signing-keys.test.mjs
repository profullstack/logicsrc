// The server's copy of the signing-key NAME rule must agree with the CLI's
// (packages/opencreds/src/signing-keys.ts): both are held to one fixture list.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { isSigningKeyName } from "../src/lib/signing-keys.mjs";

const here = dirname(fileURLToPath(import.meta.url));
const fx = JSON.parse(readFileSync(join(here, "../../../packages/opencreds/src/signing-keys.fixtures.json"), "utf8"));

test("signing key names match the shared fixtures", () => {
  for (const n of fx.signing) assert.equal(isSigningKeyName(n), true, n);
  for (const n of fx.not_signing) assert.equal(isSigningKeyName(n), false, n);
});
