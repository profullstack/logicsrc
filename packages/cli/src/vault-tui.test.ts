import { describe, expect, it } from "vitest";
import { renderToText } from "@profullstack/hqtui/testing";
import type { RemoteTeam, RemoteVault } from "@logicsrc/plugin-credential-sharing";
import {
  createVaultState, currentVault, moveSelection, nextPane, nextTab, splitVault, view,
  type VaultSnapshot, type VaultTuiState,
} from "./vault-tui.js";

const TEAMS: RemoteTeam[] = [
  { id: "t1", slug: "profullstack", name: "Profullstack" },
  { id: "t2", slug: "coinpay", name: "CoinPay" },
];

const VAULTS: RemoteVault[] = [
  { id: "v1", name: "crawlproof--prod", hasAccess: true, secretCount: 12 },
  { id: "v2", name: "crawlproof--staging", hasAccess: false, secretCount: 9 },
  { id: "v3", name: "legacy", hasAccess: true, secretCount: 1 },
];

function snapshot(): VaultSnapshot {
  return {
    teams: TEAMS,
    vaults: { profullstack: VAULTS, coinpay: [] },
    details: {
      v1: {
        secrets: [
          { name: "DATABASE_URL", nonce: "n", ciphertext: "c", fingerprint: "abcdef0123456789", version: 3, updatedAt: "2026-09-08T12:00:00.000Z" },
          { name: "STRIPE_SECRET_KEY", nonce: "n", ciphertext: "c", fingerprint: "9876543210fedcba", version: 1, updatedAt: "2026-09-01T09:30:00.000Z" },
        ],
        grants: [
          { email: "anthony@profullstack.com", publicKey: "pk", status: "active", hasPublicKey: true, hasAccess: true },
          { email: "new@profullstack.com", publicKey: null, status: "invited", hasPublicKey: false, hasAccess: false },
        ],
        audit: [{ createdAt: "2026-09-08T12:00:00.000Z", actorEmail: "anthony@profullstack.com", action: "secrets.put" }],
      },
    },
  };
}

const state = (mutate: (s: VaultTuiState) => void = () => {}): VaultTuiState => {
  const s = createVaultState(snapshot(), "anthony@profullstack.com");
  mutate(s);
  return s;
};

const frame = (s: VaultTuiState, width = 120, height = 26): string =>
  renderToText((args) => view(args as never, s), { width, height });

describe("vault name parsing", () => {
  it("splits project and environment", () => {
    expect(splitVault("crawlproof--prod")).toEqual({ project: "crawlproof", env: "prod" });
  });

  it("keeps a name with no separator whole rather than inventing an env", () => {
    expect(splitVault("legacy")).toEqual({ project: "legacy", env: "—" });
  });

  it("splits on the last separator, so a project containing one survives", () => {
    expect(splitVault("a--b--prod")).toEqual({ project: "a--b", env: "prod" });
  });
});

describe("rendering", () => {
  it("draws teams, vaults and detail", () => {
    const out = frame(state());
    expect(out).toMatch(/Teams \(2\)/);
    expect(out).toMatch(/profullstack/);
    expect(out).toMatch(/crawlproof/);
    expect(out).toMatch(/prod/);
  });

  it("shows who is signed in, because access depends on it", () => {
    expect(frame(state())).toMatch(/anthony@profullstack\.com/);
    expect(frame(state((s) => { s.identity = ""; }))).toMatch(/not signed in/);
  });

  it("shows secret names and fingerprints but never a value", () => {
    const out = frame(state((s) => { s.pane = "detail"; }));
    expect(out).toMatch(/DATABASE_URL/);
    expect(out).toMatch(/STRIPE_SECRET_KEY/);
    // The ciphertext and nonce are in the fixture; neither may reach the screen.
    expect(out).not.toMatch(/ciphertext/);
    expect(out.includes("\nc\n")).toBe(false);
  });

  it("says values stay encrypted, so nobody hunts for a reveal key", () => {
    const out = frame(state((s) => { s.pane = "detail"; }));
    expect(out).toMatch(/Values stay encrypted/);
    expect(out).toMatch(/teams pull/);
  });

  it("shows grants and the audit trail on their own tabs", () => {
    const grants = frame(state((s) => { s.tab = "grants"; }));
    expect(grants).toMatch(/anthony@profullstack\.com/);
    expect(grants).toMatch(/invited/);

    // Wider than the default here: the assertion is about the action reaching
    // the screen intact, and at 120 columns the detail pane truncates it.
    const audit = frame(state((s) => { s.tab = "audit"; }), 150);
    expect(audit).toMatch(/secrets\.put/);
    expect(audit).toMatch(/2026-09-08 12:00/);
  });

  it("reports a team with no vaults rather than drawing an empty pane", () => {
    const out = frame(state((s) => { s.team = 1; }));
    expect(out).toMatch(/No vaults in this team/);
    expect(out).toMatch(/teams push coinpay/);
  });

  it("handles having no teams at all", () => {
    const out = frame(state((s) => { s.snapshot.teams = []; }));
    expect(out).toMatch(/No teams/);
  });

  it("surfaces a detail error instead of an empty list", () => {
    const out = frame(state((s) => {
      s.snapshot.details.v1 = { secrets: [], grants: [], audit: [], error: "secrets: 403 forbidden" };
      s.pane = "detail";
    }));
    expect(out).toMatch(/403 forbidden/);
  });

  it("does not overflow a narrow terminal", () => {
    const out = frame(state(), 70, 20);
    expect(out.split("\n").every((line) => line.length <= 70)).toBe(true);
  });
});

describe("navigation", () => {
  it("cycles panes both ways", () => {
    const s = state();
    nextPane(s, 1);
    expect(s.pane).toBe("vaults");
    nextPane(s, -1);
    expect(s.pane).toBe("teams");
    nextPane(s, -1);
    expect(s.pane).toBe("detail");
  });

  it("cycles detail tabs and resets the scroll", () => {
    const s = state((x) => { x.detailOffset = 5; });
    nextTab(s, 1);
    expect(s.tab).toBe("grants");
    expect(s.detailOffset).toBe(0);
  });

  it("clamps the selection to the list", () => {
    const s = state((x) => { x.pane = "vaults"; });
    moveSelection(s, -5);
    expect(s.vault).toBe(0);
    moveSelection(s, 99);
    expect(s.vault).toBe(2);
    expect(currentVault(s)?.name).toBe("legacy");
  });

  it("resets the vault selection when the team changes", () => {
    // The old index means nothing in a different team's list, so keeping it
    // would silently select an unrelated vault.
    const s = state((x) => { x.pane = "vaults"; });
    moveSelection(s, 2);
    expect(s.vault).toBe(2);
    s.pane = "teams";
    moveSelection(s, 1);
    expect(s.team).toBe(1);
    expect(s.vault).toBe(0);
  });

  it("scrolls the detail pane when it has focus", () => {
    const s = state((x) => { x.pane = "detail"; });
    moveSelection(s, 3);
    expect(s.detailOffset).toBe(3);
    moveSelection(s, -99);
    expect(s.detailOffset).toBe(0);
  });
});
