import { mkdtempSync, mkdirSync, readFileSync, rmSync, statSync, writeFileSync, readdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { envFilesIn, findConsumers, inBatches, replaceInValue, restoreBackup, rewriteEnvFile, strayCopies } from "./propagate.js";

const dirs: string[] = [];
function www(): string {
  const d = mkdtempSync(join(tmpdir(), "logicsrc-propagate-"));
  dirs.push(d);
  return d;
}
afterEach(() => {
  for (const d of dirs.splice(0)) rmSync(d, { recursive: true, force: true });
});

const OLD = "old-secret-0123456789";
const NEW = "new-secret-abcdefghij";

describe("propagate", () => {
  it("finds consumers by value, skipping backups, and flags build-time keys", () => {
    const root = www();
    mkdirSync(join(root, "a.com"));
    mkdirSync(join(root, "b.com"));
    writeFileSync(join(root, "a.com", "app.env"), `X=1\nCRON_SECRET=${OLD}\nRENAMED="${OLD}"\n`);
    writeFileSync(join(root, "a.com", "app.env.bak-001"), `CRON_SECRET=${OLD}\n`);
    writeFileSync(join(root, "a.com", "app.bak-002.env"), `CRON_SECRET=${OLD}\n`);
    writeFileSync(join(root, "b.com", "deploy.env"), `NEXT_PUBLIC_THING=${OLD}\n`);
    expect(envFilesIn(join(root, "a.com")).map((f) => f.split("/").pop())).toEqual(["app.env"]);
    const hits = findConsumers(root, [{ oldValue: OLD, newValue: NEW }]);
    expect(hits.map((h) => [h.site, h.keys, h.needsBuild])).toEqual([
      ["a.com", ["CRON_SECRET", "RENAMED"], false],
      ["b.com", ["NEXT_PUBLIC_THING"], true]
    ]);
  });

  it("rewrites in place with a 600 backup, keeps mode and quotes, and restores", () => {
    const root = www();
    const f = join(root, "app.env");
    writeFileSync(f, `A=${OLD}\nB='${OLD}'\nDATABASE_URL=postgres://u:${OLD}@h:5432/d\nC=keep\n`, { mode: 0o600 });
    const { backup, keys } = rewriteEnvFile(f, [{ oldValue: OLD, newValue: NEW }], "20261029");
    expect(keys).toEqual(["A", "B", "DATABASE_URL"]);
    expect(readFileSync(f, "utf8")).toBe(`A=${NEW}\nB='${NEW}'\nDATABASE_URL=postgres://u:${NEW}@h:5432/d\nC=keep\n`);
    expect(statSync(f).mode & 0o777).toBe(0o600);
    expect(statSync(backup).mode & 0o777).toBe(0o600);
    expect(backup).toMatch(/app\.env\.bak-rotate-20261029$/);
    restoreBackup(f, backup);
    expect(readFileSync(f, "utf8")).toContain(`A=${OLD}`);
    const second = rewriteEnvFile(f, [{ oldValue: OLD, newValue: NEW }], "20261029");
    expect(second.backup).toMatch(/-2$/);
    expect(readdirSync(root).filter((n) => n.includes("rotate-tmp"))).toEqual([]);
  });

  it("ignores short values that could collide with unrelated text", () => {
    expect(replaceInValue("abc", [{ oldValue: "abc", newValue: "x" }])).toBeNull();
  });

  it("finds stray copies (crontab, scripts)", () => {
    const root = www();
    writeFileSync(join(root, "s"), `curl -H "x: ${OLD}"`);
    expect(strayCopies([join(root, "s"), join(root, "missing")], [{ oldValue: OLD, newValue: NEW }])).toEqual([join(root, "s")]);
  });

  it("runs at most 3 at a time", async () => {
    let running = 0;
    let peak = 0;
    await inBatches([1, 2, 3, 4, 5, 6, 7], 3, async () => {
      peak = Math.max(peak, ++running);
      await new Promise((r) => setTimeout(r, 5));
      running--;
    });
    expect(peak).toBe(3);
  });
});
