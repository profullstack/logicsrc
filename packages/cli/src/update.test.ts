import { describe, expect, it } from "vitest";

import { compareVersions, parseManifest, trackedRef, updateStatus } from "./update.js";

describe("compareVersions", () => {
  it("orders releases numerically, not lexically", () => {
    expect(compareVersions("0.2.0", "0.1.0")).toBe(1);
    expect(compareVersions("0.1.0", "0.2.0")).toBe(-1);
    expect(compareVersions("0.1.0", "0.1.0")).toBe(0);
    // "10" > "9" numerically but sorts lower as a string.
    expect(compareVersions("0.10.0", "0.9.0")).toBe(1);
    expect(compareVersions("1.0.0", "0.99.99")).toBe(1);
  });

  it("tolerates v-prefixes, prereleases, and short versions", () => {
    expect(compareVersions("v1.2.3", "1.2.3")).toBe(0);
    expect(compareVersions("1.2.0-beta.1", "1.2.0")).toBe(0);
    expect(compareVersions("1.2", "1.2.0")).toBe(0);
    expect(compareVersions("garbage", "0.0.0")).toBe(0);
  });
});

describe("parseManifest", () => {
  it("reads a manifest written by install.sh", () => {
    const m = parseManifest(
      JSON.stringify({ ref: "master", commit: "abc1234def", version: "0.1.0", installed_at: "2026-07-28T00:00:00Z" })
    );
    expect(m).toEqual({ ref: "master", commit: "abc1234def", version: "0.1.0", installed_at: "2026-07-28T00:00:00Z" });
  });

  it("defaults the ref and nulls empty or missing fields", () => {
    // install.sh writes empty strings when the sha lookup or version read fails.
    expect(parseManifest(JSON.stringify({ commit: "", version: "" }))).toEqual({
      ref: "master",
      commit: null,
      version: null,
      installed_at: null
    });
  });

  it("returns null for junk rather than throwing", () => {
    expect(parseManifest("not json")).toBeNull();
    expect(parseManifest("[]")).toBeNull();
    expect(parseManifest("null")).toBeNull();
  });
});

describe("trackedRef", () => {
  it("prefers the environment, then the manifest, then master", () => {
    const manifest = { ref: "next", commit: null, version: null, installed_at: null };
    expect(trackedRef(manifest, { LOGICSRC_REF: "experiment" })).toBe("experiment");
    expect(trackedRef(manifest, {})).toBe("next");
    expect(trackedRef(null, {})).toBe("master");
  });
});

describe("updateStatus", () => {
  const local = { version: "0.1.0", commit: "aaaaaaaaaaaa" };

  it("reports up to date only when the commit actually matches", () => {
    const s = updateStatus(local, { version: "0.1.0", commit: "aaaaaaaaaaaa" });
    expect(s.upToDate).toBe(true);
    expect(s.reason).toContain("current commit");
  });

  it("matches a short sha against a full one", () => {
    expect(updateStatus({ version: "0.1.0", commit: "aaaaaaa" }, { version: "0.1.0", commit: "aaaaaaaaaaaa" }).upToDate).toBe(true);
  });

  it("detects a moved branch even when the version is unchanged", () => {
    // The bug this replaces: version-only comparison called this "up to date"
    // forever, because the installer ships a branch tarball, not a release.
    const s = updateStatus(local, { version: "0.1.0", commit: "bbbbbbbbbbbb" });
    expect(s.upToDate).toBe(false);
    expect(s.reason).toContain("moved on");
  });

  it("detects a newer published version", () => {
    const s = updateStatus(local, { version: "0.2.0", commit: "aaaaaaaaaaaa" });
    expect(s.upToDate).toBe(false);
    expect(s.reason).toContain("0.1.0 → 0.2.0");
  });

  it("never claims to be current when the local commit is unknown", () => {
    const s = updateStatus({ version: "0.1.0", commit: null }, { version: "0.1.0", commit: "bbbbbbbbbbbb" });
    expect(s.upToDate).toBe(false);
    expect(s.reason).toContain("predates update tracking");
  });

  it("does not invent an update when GitHub is unreachable", () => {
    const s = updateStatus(local, { version: null, commit: null });
    expect(s.upToDate).toBe(true);
    expect(s.reason).toContain("could not reach GitHub");
  });
});
