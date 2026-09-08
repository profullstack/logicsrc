/**
 * Frames for the hqtui.com apps showcase.
 *
 * hqtui.com/apps captures screenshots of applications built on the library. The
 * capture script takes an application directory and imports this file, because
 * only the application knows what a good state looks like.
 *
 * The vault browser is the right thing to show, and it is safe to show for the
 * same reason it was built that way: it never handles plaintext. Everything on
 * this screen is metadata — which vaults exist, what their secrets are called,
 * who can decrypt them — so a screenshot of it leaks nothing that the screen
 * itself would not already put in front of anyone standing behind you.
 *
 * The values here are invented regardless. A real team's member emails are not
 * ours to publish.
 */
import type { RemoteGrantRow, RemoteSecret, RemoteTeam, RemoteVault } from "@logicsrc/plugin-credential-sharing";
import { createVaultState, type VaultSnapshot, type VaultTuiState } from "../packages/cli/src/vault-tui.js";
import { view } from "../packages/cli/src/vault-tui.js";

const TEAMS: RemoteTeam[] = [
  { id: "t1", slug: "profullstack", name: "Profullstack" },
  { id: "t2", slug: "coinpay", name: "CoinPay" },
  { id: "t3", slug: "crawlproof", name: "CrawlProof" },
];

const VAULTS: RemoteVault[] = [
  { id: "v1", name: "hqtui--prod", hasAccess: true, secretCount: 6 },
  { id: "v2", name: "rssamplifier--prod", hasAccess: true, secretCount: 14 },
  { id: "v3", name: "rssamplifier--staging", hasAccess: false, secretCount: 14 },
  { id: "v4", name: "tipoffwatch--prod", hasAccess: true, secretCount: 9 },
  { id: "v5", name: "genrewatch--prod", hasAccess: true, secretCount: 11 },
];

const secret = (
  name: string,
  version: number,
  fingerprint: string,
  updatedAt: string,
): RemoteSecret => ({ name, nonce: "…", ciphertext: "…", fingerprint, version, updatedAt });

const GRANTS: RemoteGrantRow[] = [
  { email: "anthony@profullstack.com", publicKey: "pk", status: "active", hasPublicKey: true, hasAccess: true },
  { email: "deploy@profullstack.com", publicKey: "pk", status: "active", hasPublicKey: true, hasAccess: true },
  { email: "new.hire@profullstack.com", publicKey: null, status: "invited", hasPublicKey: false, hasAccess: false },
];

const SNAPSHOT: VaultSnapshot = {
  teams: TEAMS,
  vaults: { profullstack: VAULTS, coinpay: [], crawlproof: [] },
  details: {
    v1: {
      secrets: [
        secret("DATABASE_URL", 4, "3f9a2c8e1b04", "2026-09-08T12:04:00.000Z"),
        secret("NPM_TOKEN", 2, "a71c05de9f32", "2026-09-04T08:15:00.000Z"),
        secret("RAILWAY_TOKEN", 1, "5b2e77aa10cd", "2026-08-30T19:42:00.000Z"),
        secret("SESSION_SECRET", 3, "e18b40cc7295", "2026-09-02T13:20:00.000Z"),
        secret("STRIPE_SECRET_KEY", 7, "c904ff21be76", "2026-09-07T22:11:00.000Z"),
        secret("TURSO_AUTH_TOKEN", 2, "9d3c1a55f0e8", "2026-09-06T10:05:00.000Z"),
      ],
      grants: GRANTS,
      audit: [],
    },
  },
};

function vaultState(): VaultTuiState {
  const state = createVaultState(SNAPSHOT, "anthony@profullstack.com");
  state.pane = "detail";
  state.tab = "secrets";
  state.vault = 0;
  return state;
}

const STATE = vaultState();

export const frames = [
  {
    name: "logicsrc",
    width: 128,
    height: 28,
    draw: (args: Parameters<typeof view>[0]) => {
      view(args, STATE);
    },
  },
];
