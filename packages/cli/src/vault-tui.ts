/**
 * `logicsrc teams tui` — a terminal browser for team credential vaults.
 *
 * Read-only, and it never handles plaintext.
 *
 * The server only ever holds ciphertext, and this screen keeps it that way: it
 * shows which vaults exist, how many secrets each holds, what those secrets are
 * *called*, who can decrypt them, and what has changed. It does not fetch a
 * decryption key, does not unwrap one, and has no keybinding that would. A
 * secret's value is `logicsrc teams pull`, in a shell, on purpose — a value
 * that can appear on screen is a value that can appear in a screen share, a
 * scrollback buffer, or a recording.
 *
 * Names are not secret and are the thing you actually need to navigate; values
 * are, and they are the thing you rarely need to look at.
 */
import type { Container, Theme } from "@profullstack/hqtui";
import type {
  RemoteGrantRow, RemoteSecret, RemoteTeam, RemoteVault,
} from "@logicsrc/plugin-credential-sharing";

/** A vault name is `<project>--<env>`; anything else is shown as it came. */
export function splitVault(name: string): { project: string; env: string } {
  const at = name.lastIndexOf("--");
  if (at <= 0) return { project: name, env: "—" };
  return { project: name.slice(0, at), env: name.slice(at + 2) };
}

export interface VaultDetail {
  secrets: RemoteSecret[];
  grants: RemoteGrantRow[];
  audit: Array<Record<string, unknown>>;
  error?: string;
}

export interface VaultSnapshot {
  teams: RemoteTeam[];
  /** Vaults per team slug, loaded when the team is first selected. */
  vaults: Record<string, RemoteVault[]>;
  /** Detail per vault id, loaded when the vault is first selected. */
  details: Record<string, VaultDetail>;
}

export type Pane = "teams" | "vaults" | "detail";
export type DetailTab = "secrets" | "grants" | "audit";

export interface VaultTuiState {
  snapshot: VaultSnapshot;
  pane: Pane;
  tab: DetailTab;
  team: number;
  vault: number;
  offsets: Record<Pane, number>;
  detailOffset: number;
  loading: boolean;
  note: string;
  /** Who is signed in, shown so you know whose access you are looking at. */
  identity: string;
}

export function createVaultState(
  snapshot: VaultSnapshot,
  identity = "",
): VaultTuiState {
  return {
    snapshot,
    pane: "teams",
    tab: "secrets",
    team: 0,
    vault: 0,
    offsets: { teams: 0, vaults: 0, detail: 0 },
    detailOffset: 0,
    loading: false,
    note: "",
    identity,
  };
}

export function currentTeam(state: VaultTuiState): RemoteTeam | undefined {
  return state.snapshot.teams[state.team];
}

export function currentVaults(state: VaultTuiState): RemoteVault[] {
  const team = currentTeam(state);
  return team ? (state.snapshot.vaults[team.slug] ?? []) : [];
}

export function currentVault(state: VaultTuiState): RemoteVault | undefined {
  return currentVaults(state)[state.vault];
}

export function currentDetail(state: VaultTuiState): VaultDetail | undefined {
  const vault = currentVault(state);
  return vault ? state.snapshot.details[vault.id] : undefined;
}

const PANES: Pane[] = ["teams", "vaults", "detail"];
const TABS: DetailTab[] = ["secrets", "grants", "audit"];

export function nextPane(state: VaultTuiState, delta: number): void {
  const at = PANES.indexOf(state.pane);
  state.pane = PANES[(at + delta + PANES.length) % PANES.length] as Pane;
}

export function nextTab(state: VaultTuiState, delta: number): void {
  const at = TABS.indexOf(state.tab);
  state.tab = TABS[(at + delta + TABS.length) % TABS.length] as DetailTab;
  state.detailOffset = 0;
}

/** Move the selection in whichever pane has focus, clamped to its contents. */
export function moveSelection(state: VaultTuiState, delta: number): void {
  if (state.pane === "teams") {
    const total = state.snapshot.teams.length;
    if (total === 0) return;
    const next = Math.max(0, Math.min(total - 1, state.team + delta));
    if (next === state.team) return;
    state.team = next;
    // A different team means a different vault list, so the old index is
    // meaningless rather than merely out of range.
    state.vault = 0;
    state.detailOffset = 0;
    return;
  }
  if (state.pane === "vaults") {
    const total = currentVaults(state).length;
    if (total === 0) return;
    const next = Math.max(0, Math.min(total - 1, state.vault + delta));
    if (next === state.vault) return;
    state.vault = next;
    state.detailOffset = 0;
    return;
  }
  state.detailOffset = Math.max(0, state.detailOffset + delta);
}

function shortTime(value: unknown): string {
  if (typeof value !== "string" || value === "") return "—";
  const at = new Date(value);
  if (Number.isNaN(at.getTime())) return "—";
  return at.toISOString().slice(0, 16).replace("T", " ");
}

/**
 * Date only, for the secrets table.
 *
 * Three fixed columns plus a name that can run to 30 characters leaves no room
 * for a timestamp, and a truncated one ("2026-09-0…") is worse than no clock:
 * it looks like data while telling you nothing the date did not.
 */
function shortDate(value: unknown): string {
  if (typeof value !== "string" || value === "") return "—";
  const at = new Date(value);
  if (Number.isNaN(at.getTime())) return "—";
  return at.toISOString().slice(0, 10);
}

/** A fingerprint identifies a value without revealing it. */
function shortFingerprint(value: string): string {
  return value.length <= 12 ? value : `${value.slice(0, 12)}…`;
}

export function view(
  { ui, theme, height }: { ui: Container; theme: Theme; height: number },
  state: VaultTuiState,
): void {
  const team = currentTeam(state);
  const vaults = currentVaults(state);
  const vault = currentVault(state);
  const detail = currentDetail(state);

  ui.row({ size: 1 }, (header) => {
    header.text(" logicsrc vaults", { fg: theme.title, bold: true, size: 17 });
    header.text(state.identity || "not signed in", {
      fg: state.identity ? theme.accent : theme.danger,
      size: 30,
    });
    header.text(
      `${state.loading ? "loading… " : ""}Tab panes  ←/→ view  r reload  q quit `,
      { fg: theme.muted, align: "right" },
    );
  });

  ui.row({ size: height - 3, gap: 1 }, (row) => {
    row.panel({
      title: `Teams (${state.snapshot.teams.length})`,
      width: "0.7fr",
      borderColor: state.pane === "teams" ? theme.borderFocused : theme.border,
    }, (p) => {
      if (state.snapshot.teams.length === 0) {
        p.label("No teams.");
        p.label("logicsrc teams create <slug>", { size: 1 });
        return;
      }
      p.list({
        items: state.snapshot.teams.map((t) => t.slug),
        selected: state.team,
        offset: state.offsets.teams,
        scrollbar: true,
        onScroll: (d) => { state.offsets.teams = Math.max(0, state.offsets.teams + d); },
      });
    });

    row.panel({
      title: team ? `Vaults · ${team.slug} (${vaults.length})` : "Vaults",
      width: "1.1fr",
      borderColor: state.pane === "vaults" ? theme.borderFocused : theme.border,
    }, (p) => {
      if (!team) { p.label("Select a team."); return; }
      if (vaults.length === 0) {
        p.label("No vaults in this team.");
        p.label(`logicsrc teams push ${team.slug} <project> <env>`, { size: 1 });
        return;
      }
      p.table({
        rows: vaults.map((v) => {
          const parts = splitVault(v.name);
          return {
            project: parts.project,
            env: parts.env,
            n: String(v.secretCount),
            access: v.hasAccess ? "yes" : "no",
            hasAccess: v.hasAccess,
          };
        }),
        selected: state.vault,
        offset: state.offsets.vaults,
        followSelection: true,
        scrollbar: true,
        onScroll: (d) => { state.offsets.vaults = Math.max(0, state.offsets.vaults + d); },
        columns: [
          { key: "project", title: "Project", min: 8, color: theme.foreground },
          { key: "env", title: "Env", width: 10, color: theme.accent },
          { key: "n", title: "Secrets", width: 8, align: "right", color: theme.muted },
          {
            key: "access", title: "Access", width: 7,
            // Whether you can decrypt is the thing you came to find out, so it
            // is coloured per row rather than shown as plain text.
            color: (r) => (r.hasAccess ? theme.success : theme.warning),
          },
        ],
      });
    });

    row.panel({
      title: vault ? `${splitVault(vault.name).project} · ${state.tab}` : "Detail",
      width: "1.3fr",
      borderColor: state.pane === "detail" ? theme.borderFocused : theme.border,
    }, (p) => {
      if (!vault) { p.label("Select a vault."); return; }
      p.row({ size: 1 }, (r) => {
        r.tabs({
          tabs: TABS.map((t) => t),
          active: TABS.indexOf(state.tab),
          onSelect: (index) => { state.tab = TABS[index] as DetailTab; state.detailOffset = 0; },
        });
      });
      p.divider();

      if (!detail) { p.label("Loading…"); return; }
      if (detail.error) { p.text(detail.error, { fg: theme.danger, wrap: true }); return; }

      if (state.tab === "secrets") {
        if (detail.secrets.length === 0) { p.label("No secrets in this vault."); return; }
        p.table({
          rows: detail.secrets.slice(state.detailOffset).map((s) => ({
            name: s.name,
            version: `v${s.version}`,
            fingerprint: shortFingerprint(s.fingerprint),
            updated: shortDate(s.updatedAt),
          })),
          selected: -1,
          scrollbar: true,
          onScroll: (d) => { state.detailOffset = Math.max(0, state.detailOffset + d); },
          columns: [
            { key: "name", title: "Name", min: 12, color: theme.foreground },
            { key: "version", title: "Ver", width: 5, color: theme.muted },
            { key: "fingerprint", title: "Fingerprint", width: 14, color: theme.secondary },
            { key: "updated", title: "Updated", width: 10, color: theme.muted },
          ],
        });
        p.divider();
        // Said on the screen, not just in the docs: someone will look for the
        // reveal key, and the answer is that there deliberately isn't one.
        p.text(
          `Values stay encrypted. To read them: logicsrc teams pull ${team?.slug ?? "<team>"} `
          + `${splitVault(vault.name).project} ${splitVault(vault.name).env}`,
          { fg: theme.muted, wrap: true },
        );
        return;
      }

      if (state.tab === "grants") {
        if (detail.grants.length === 0) { p.label("Nobody can decrypt this vault."); return; }
        p.table({
          rows: detail.grants.slice(state.detailOffset).map((g) => ({
            email: g.email,
            status: g.status,
            key: g.hasPublicKey ? "yes" : "no",
            access: g.hasAccess ? "yes" : "no",
            hasAccess: g.hasAccess,
          })),
          selected: -1,
          scrollbar: true,
          onScroll: (d) => { state.detailOffset = Math.max(0, state.detailOffset + d); },
          columns: [
            { key: "email", title: "Member", min: 14, color: theme.foreground },
            { key: "status", title: "Status", width: 8, color: theme.muted },
            { key: "key", title: "Key", width: 4, color: theme.muted },
            {
              key: "access", title: "Decrypt", width: 8,
              color: (r) => (r.hasAccess ? theme.success : theme.muted),
            },
          ],
        });
        return;
      }

      if (detail.audit.length === 0) { p.label("No audit entries."); return; }
      p.table({
        rows: detail.audit.slice(state.detailOffset).map((entry) => ({
          when: shortTime(entry.createdAt ?? entry.at),
          who: String(entry.actorEmail ?? entry.actor ?? "—"),
          what: String(entry.action ?? entry.event ?? "—"),
        })),
        selected: -1,
        scrollbar: true,
        onScroll: (d) => { state.detailOffset = Math.max(0, state.detailOffset + d); },
        columns: [
          { key: "when", title: "When", width: 17, color: theme.muted },
          // The action is the point of an audit row, so it gets the wider
          // floor: an email truncates to something still recognisable, where
          // "secrets…" could be put, get or delete.
          { key: "who", title: "Who", min: 8, color: theme.foreground },
          { key: "what", title: "What", min: 16, color: theme.accent },
        ],
      });
    });
  });

  ui.statusBar({
    items: [
      { key: "Tab", label: state.pane, active: true },
      { key: "←/→", label: state.tab },
      { key: "↑↓", label: "Move" },
      { key: "r", label: "Reload" },
      { key: "q", label: "Quit" },
    ],
    right: [{ label: state.note }],
  });
}
