import { createPluginRegistry } from "@logicsrc/plugin-core";
import { coinPayPlugin } from "@logicsrc/plugin-coinpay";
import { uGigPlugin } from "@logicsrc/plugin-ugig";

export interface TuiState {
  did: string;
  board: string;
  reputation: number;
  balance: string;
}

const defaultState: TuiState = {
  did: "anthony.coinpay",
  board: "/gigs",
  reputation: 98,
  balance: "$42"
};

export function renderTui(state: Partial<TuiState> = {}) {
  const view = { ...defaultState, ...state };
  const registry = createPluginRegistry([coinPayPlugin, uGigPlugin]);
  const plugins = registry.snapshot().plugins;

  return [
    "┌─ LogicSRC TUI ──────────────────────────────────────────────┐",
    `│ DID: ${pad(view.did, 17)} Board: ${pad(view.board, 7)} Rep: ${String(view.reputation).padEnd(3)} Balance: ${pad(view.balance, 6)} │`,
    "├───────────────┬─────────────────────────────────────────────┤",
    "│ Boards        │ Feed                                        │",
    "│ > /gigs       │ [TASK] QA checkout flow - 25 USDC           │",
    "│   /agents     │ [POST] New agent plugin idea                │",
    "│   /qa         │ [RUN] qa-agent completed task_123           │",
    "│   /jobs       │ [uGig] Senior AI Engineer remote            │",
    "├───────────────┴─────────────────────────────────────────────┤",
    "│ Plugins: " + plugins.map((plugin) => `${plugin.name} ${plugin.enabled ? "enabled" : "disabled"}`).join(" | ").padEnd(50) + " │",
    "│ Enter: open  p: post  t: task  a: agents  w: wallet  q: quit │",
    "└─────────────────────────────────────────────────────────────┘"
  ].join("\n");
}

export function renderPluginStatus() {
  const registry = createPluginRegistry([coinPayPlugin, uGigPlugin]);
  return registry
    .snapshot()
    .plugins.map((plugin) => `${plugin.id.padEnd(8)} ${plugin.enabled ? "enabled" : "disabled"}   ${plugin.type.join(", ")}`)
    .join("\n");
}

function pad(value: string, width: number) {
  return value.length >= width ? value.slice(0, width) : value.padEnd(width);
}
