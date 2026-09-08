/**
 * Loading and running the vault browser.
 *
 * Split from vault-tui.ts so the view can be rendered headlessly in tests
 * without an authenticated client or a terminal.
 */
import type { TeamClient } from "@logicsrc/plugin-credential-sharing";
import {
  createVaultState, currentTeam, currentVault, moveSelection, nextPane, nextTab,
  view, type VaultDetail, type VaultSnapshot, type VaultTuiState,
} from "./vault-tui.js";

/** Teams first; vaults and detail load lazily, because both cost a round trip. */
export async function loadTeams(client: TeamClient): Promise<VaultSnapshot> {
  const { teams } = await client.listTeams();
  return { teams, vaults: {}, details: {} };
}

export async function loadVaults(client: TeamClient, state: VaultTuiState): Promise<void> {
  const team = currentTeam(state);
  if (!team || state.snapshot.vaults[team.slug]) return;
  try {
    const { vaults } = await client.listVaults(team.slug);
    state.snapshot.vaults[team.slug] = vaults;
  } catch (error) {
    state.snapshot.vaults[team.slug] = [];
    state.note = `could not list vaults: ${message(error)}`;
  }
}

/**
 * Secret names, grants and audit for one vault.
 *
 * Each is fetched independently and a failure is recorded rather than thrown:
 * a member without decryption access can still read the vault's shape, and
 * losing the audit endpoint should not blank the secrets list.
 */
export async function loadDetail(client: TeamClient, state: VaultTuiState): Promise<void> {
  const vault = currentVault(state);
  if (!vault || state.snapshot.details[vault.id]) return;
  const detail: VaultDetail = { secrets: [], grants: [], audit: [] };
  const [secrets, grants, audit] = await Promise.allSettled([
    client.listSecrets(vault.id),
    client.listGrants(vault.id),
    client.listAudit(vault.id),
  ]);
  if (secrets.status === "fulfilled") detail.secrets = secrets.value.secrets;
  else detail.error = `secrets: ${message(secrets.reason)}`;
  if (grants.status === "fulfilled") detail.grants = grants.value.grants;
  if (audit.status === "fulfilled") detail.audit = audit.value.audit;
  state.snapshot.details[vault.id] = detail;
}

function message(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

export interface VaultTuiOptions {
  client: TeamClient;
  identity?: string;
  theme?: string;
}

export async function runVaultTui({ client, identity = "", theme }: VaultTuiOptions): Promise<void> {
  const { createApp, themes } = await loadHqtui();
  const state = createVaultState(await loadTeams(client), identity);

  const named = theme ? (themes as Record<string, typeof themes.dark | undefined>)[theme] : undefined;
  const app = await createApp({
    theme: named ?? themes.dark,
    title: "logicsrc vaults",
    quitKeys: ["ctrl+c"],
  });

  const refresh = async (): Promise<void> => {
    state.loading = true;
    app.invalidate();
    await loadVaults(client, state);
    await loadDetail(client, state);
    state.loading = false;
    app.invalidate();
  };

  app.on("key", (event: { key: string }) => {
    switch (event.key) {
      case "q": app.quit(); return;
      case "tab": nextPane(state, 1); void refresh(); return;
      case "shift+tab": nextPane(state, -1); return;
      case "right": nextTab(state, 1); return;
      case "left": nextTab(state, -1); return;
      case "up": moveSelection(state, -1); void refresh(); return;
      case "down": moveSelection(state, 1); void refresh(); return;
      case "pageup": moveSelection(state, -10); void refresh(); return;
      case "pagedown": moveSelection(state, 10); void refresh(); return;
      case "r":
        // Drop the caches so a reload actually re-fetches rather than
        // redrawing what is already on screen.
        state.snapshot.vaults = {};
        state.snapshot.details = {};
        state.note = "reloaded";
        void refresh();
        return;
    }
  });

  await refresh();
  app.render((args) => view(args, state));
  await app.start();
}

/** hqtui needs Node 22.6+; say so rather than showing a module resolution error. */
async function loadHqtui(): Promise<typeof import("@profullstack/hqtui")> {
  try {
    return await import("@profullstack/hqtui");
  } catch (error) {
    const [major, minor] = process.versions.node.split(".").map(Number);
    const tooOld = (major ?? 0) < 22 || ((major ?? 0) === 22 && (minor ?? 0) < 6);
    throw new Error(
      tooOld
        ? `The vault browser needs Node 22.6 or newer (this is ${process.versions.node}). `
          + `Use \`logicsrc teams vaults <slug>\` instead.`
        : `Could not load @profullstack/hqtui: ${message(error)}. `
          + `Use \`logicsrc teams vaults <slug>\` instead.`,
    );
  }
}
