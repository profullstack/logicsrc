import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { loadOntologyPackage } from "./package.js";
import { initOntologyPackage } from "./scaffold.js";
import type { LoadedPackage } from "./types.js";

/**
 * A scaffolded package with a pinned timestamp, for tests that need real data
 * without depending on the Ethereum example (which is removable by design).
 */
export function loadPrdFixturePackage(id = "test-ecosystem"): LoadedPackage {
  const dir = mkdtempSync(join(tmpdir(), "openontology-fixture-"));
  initOntologyPackage(dir, { id, now: "2026-07-26T00:00:00Z" });
  return loadOntologyPackage(dir);
}
