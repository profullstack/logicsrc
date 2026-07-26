import { execFileSync } from "node:child_process";
import { existsSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const HERE = dirname(fileURLToPath(import.meta.url));
const DIST = resolve(HERE, "../dist/index.js");
const EXAMPLE = resolve(HERE, "../../../examples/openontology/ethereum-ecosystem");

/**
 * Node.js and Bun must produce byte-identical output (R145/R208).
 *
 * The engine takes an injected clock and id factory precisely so this can be
 * asserted rather than hoped for. Runs against the built dist, and skips when
 * the package has not been built or Bun is not installed.
 */
const PROGRAM = `
import { buildOntologyPackage, canonicalize, createOntologyEngine, loadOntologyPackage, localActor } from ${JSON.stringify(DIST)};

const pkg = loadOntologyPackage(${JSON.stringify(EXAMPLE)});
const built = buildOntologyPackage(pkg);

let n = 0;
const engine = createOntologyEngine({
  package: pkg,
  actor: localActor("curator@example.org"),
  clock: () => "2026-07-26T00:00:00Z",
  idFactory: (kind) => kind + ":" + String(++n).padStart(4, "0")
});

const changeSet = engine.createOntologyChangeSet({
  title: "runtime parity",
  operations: [
    {
      op: "assert-claim",
      value: {
        subject: "eth:person:avery-lindqvist",
        predicate: "worksOn",
        object: { entity: "eth:project:docs-portal" },
        sources: ["eth:source:roadmap-2026"]
      }
    }
  ]
});
engine.approveOntologyChangeSet(changeSet.id);
const applied = engine.applyOntologyChangeSet(changeSet.id);

console.log(canonicalize({
  digest: built.digest,
  revision: applied.revision,
  events: applied.events.map((e) => ({ id: e.id, type: e.type, at: e.at })),
  rows: engine.queryOntology("orgs-behind-a-network").rows.map((r) => r.bindings)
}));
`;

function bunAvailable(): boolean {
  try {
    execFileSync("bun", ["--version"], { stdio: "pipe" });
    return true;
  } catch {
    return false;
  }
}

const runnable = existsSync(DIST) && bunAvailable();
const describeParity = runnable ? describe : describe.skip;

describeParity("Node.js / Bun parity", () => {
  it("produces an identical digest, revision, event trail, and result set", () => {
    const dir = mkdtempSync(join(tmpdir(), "openontology-parity-"));
    const script = join(dir, "parity.mjs");
    writeFileSync(script, PROGRAM, "utf8");

    try {
      const fromNode = execFileSync(process.execPath, [script], { encoding: "utf8" }).trim();
      const fromBun = execFileSync("bun", [script], { encoding: "utf8" }).trim();

      expect(fromBun).toBe(fromNode);
      expect(JSON.parse(fromNode).revision).toBe("data-000001");
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
