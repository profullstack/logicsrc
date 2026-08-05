import { mkdtempSync, mkdirSync, symlinkSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { linkedDirectory, readSecretsLink, requireSecretsLink, writeSecretsLink } from "./secrets-link.js";

describe("directory secrets links", () => {
  it("stores link metadata outside the linked project", () => {
    const sandbox = mkdtempSync(join(tmpdir(), "logicsrc-link-"));
    const project = join(sandbox, "project");
    const file = join(sandbox, "config", "secrets-links.json");
    mkdirSync(project);

    const link = writeSecretsLink({ team: "acme", project: "web", env: "prod" }, project, file);

    expect(readSecretsLink(project, file)).toEqual(link);
    expect(link.directory).toBe(project);
    expect(file.startsWith(project)).toBe(false);
  });

  it("keys links by the real directory so symlinked paths share one link", () => {
    const sandbox = mkdtempSync(join(tmpdir(), "logicsrc-link-"));
    const project = join(sandbox, "project");
    const alias = join(sandbox, "alias");
    const file = join(sandbox, "secrets-links.json");
    mkdirSync(project);
    symlinkSync(project, alias, "dir");

    writeSecretsLink({ team: "acme", project: "api", env: "staging" }, alias, file);

    expect(linkedDirectory(alias)).toBe(project);
    expect(readSecretsLink(project, file)?.env).toBe("staging");
  });

  it("requires an explicit link for each directory", () => {
    const sandbox = mkdtempSync(join(tmpdir(), "logicsrc-link-"));
    const linked = join(sandbox, "linked");
    const unlinked = join(sandbox, "unlinked");
    const file = join(sandbox, "secrets-links.json");
    mkdirSync(linked);
    mkdirSync(unlinked);
    writeSecretsLink({ team: "acme", project: "web", env: "prod" }, linked, file);

    expect(() => requireSecretsLink(unlinked, file)).toThrow(/logicsrc secrets teams link/);
  });
});
