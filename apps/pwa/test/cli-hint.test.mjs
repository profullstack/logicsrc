// The dashboard's "Connect the CLI" card is the copy/paste entry point for the
// directory-linked workflow. Pin the actual commands so the hosted app cannot
// drift back to verbose targets or imply that up/down work without a link.
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

test("the dashboard teaches link before up and down", () => {
  const lines = commands(HOSTED);
  const link = lines.findIndex((line) => line.includes("secrets teams link"));
  const up = lines.findIndex((line) => line.includes("secrets up"));
  const down = lines.findIndex((line) => line.includes("secrets down [env]"));
  assert.ok(link >= 0, "no secrets teams link line");
  assert.ok(up > link, "secrets up must appear after link");
  assert.ok(down > link, "secrets down must appear after link");
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
