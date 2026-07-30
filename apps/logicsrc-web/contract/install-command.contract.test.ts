// The install command is the site's single most copy-pasted string, and it is
// rendered in two places by two different mechanisms -- the homepage builds
// HTML as a string, the rest of the site is JSX. That is exactly the shape that
// lets one copy drift while the other stays right, so these pin the command
// itself, both placements, and the flags that make piping to `sh` safe.
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

import {
  INSTALL_COMMAND,
  INSTALL_SCRIPT_PATH,
  renderInstallCommand,
} from "../src/lib/install-command";
import { renderPageMarkup } from "../src/lib/page-markup";

const repoRoot = join(__dirname, "..");

describe("the install command itself", () => {
  it("is the exact one-liner", () => {
    expect(INSTALL_COMMAND).toBe("curl -fsSL https://logicsrc.com/install.sh | sh");
  });

  it("keeps the flags that make piping into a shell safe", () => {
    // -f so an HTTP error page is never piped into sh, -L so a redirect does
    // not silently truncate the install. Dropping either is the bug this pins.
    expect(INSTALL_COMMAND).toMatch(/curl\b[^|]*-[a-zA-Z]*f/);
    expect(INSTALL_COMMAND).toMatch(/curl\b[^|]*-[a-zA-Z]*L/);
  });

  it("points at a script that is actually published", () => {
    // public/ is served at the site root, so this is the URL in the command.
    const script = readFileSync(join(repoRoot, "public", INSTALL_SCRIPT_PATH), "utf8");
    expect(script.startsWith("#!/bin/sh")).toBe(true);
    // The command says `| sh`; a bash shebang here would make that a lie.
    expect(script).toContain(INSTALL_COMMAND);
  });
});

describe.each(["hero", "rail"] as const)("the %s placement", (variant) => {
  const html = renderInstallCommand(variant);

  it("shows the command", () => {
    expect(html).toContain(INSTALL_COMMAND);
  });

  it("offers a copy button carrying the same text that is on screen", () => {
    expect(html).toContain(`data-copy="${INSTALL_COMMAND}"`);
    // A button whose clipboard payload differs from the visible command is
    // worse than no button, so the two are asserted against one constant.
    const shown = html.match(/<code[^>]*>([^<]+)<\/code>/)?.[1];
    const copied = html.match(/data-copy="([^"]+)"/)?.[1];
    expect(shown).toBe(copied);
  });

  it("is a real button, reachable by keyboard and labelled", () => {
    expect(html).toContain('type="button"');
    expect(html).toContain('aria-label="Copy the install command"');
  });
});

describe("placement on the site", () => {
  const home = renderPageMarkup();

  it("puts the loud version in the homepage hero", () => {
    expect(home).toContain('class="install-cta"');
    // Above the fold means before the first content band, not merely present.
    expect(home.indexOf("install-cta")).toBeLessThan(home.indexOf('class="band"'));
  });

  it("also carries the compact version in the chrome", () => {
    expect(home).toContain('class="install-rail"');
  });

  it("keeps the compact one out of the way -- inside the rail, above the nav", () => {
    const rail = home.indexOf('class="install-rail"');
    expect(rail).toBeGreaterThan(home.indexOf('class="rail"'));
    expect(rail).toBeLessThan(home.indexOf("<nav"));
  });

  it("renders the command twice and no more", () => {
    expect(home.split(INSTALL_COMMAND).length - 1).toBe(4); // 2 placements x (code + data-copy)
  });
});
