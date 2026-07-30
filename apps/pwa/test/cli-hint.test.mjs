// The dashboard's "Connect the CLI" card kept printing commands that no longer
// ran. It survived two releases of drift: `logicsrc teams push <team> prod` is
// two positionals, and since vaults became <team> <project> <env> the CLI exits
// with a usage error on paste. It also told everyone to set LOGICSRC_API to the
// value the CLI already defaults to, which reads like a required step.
//
// A card that hands out commands is only useful if the commands run, so these
// pin the shape rather than the prose -- restyling the card is free, quietly
// dropping an argument is not.
import assert from "node:assert/strict";
import test from "node:test";

import { CLI_HINT } from "../src/lib/cli-hint.mjs";

/** The commands themselves, with the entities decoded back to real syntax. */
const commands = (origin) =>
  CLI_HINT(origin)
    .match(/margin:0">([\s\S]*?)<\/pre>/)[1]
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .split("\n");

const HOSTED = "https://app.logicsrc.com";

test("push and pull carry all three vault positionals", () => {
  for (const verb of ["push", "pull"]) {
    const line = commands(HOSTED).find((l) => l.includes(`teams ${verb}`));
    assert.ok(line, `no teams ${verb} line`);
    assert.match(line, /teams (push|pull) <team> <project> <env>/);
    // Guards the specific regression: two positionals used to be enough.
    // Drop "logicsrc teams <verb>" and count only what follows.
    const args = line.split("#")[0].trim().split(/\s+/).slice(3);
    assert.equal(args.length, 3, `teams ${verb} needs 3 args, got ${args.join(" ")}`);
  }
});

test("the local .env path is left at its default", () => {
  // `--env <path>` defaults to .env in the CLI. Spelling it out next to the
  // <env> positional made two unrelated things look like one.
  assert.ok(!commands(HOSTED).some((l) => l.includes("--env")));
});

test("the hosted origin needs no LOGICSRC_API prefix", () => {
  const login = commands(HOSTED).find((l) => l.includes("logicsrc login"));
  assert.equal(login, "logicsrc login");
});

test("a self-hosted origin still gets the prefix", () => {
  const login = commands("http://localhost:8080").find((l) => l.includes("logicsrc login"));
  assert.equal(login, "LOGICSRC_API=http://localhost:8080 logicsrc login");
});
