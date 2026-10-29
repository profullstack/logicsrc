/**
 * Dashboard recipes for `method: "desktop"`: how an agent on a W3BS Agentic
 * Desktop Layer host finds, creates and revokes one provider's API key in a
 * signed-in browser. Pure data, so the catalog, the CLI and the credentials app
 * can all read it.
 *
 * Wording rules for every recipe:
 *   - the old key is found by its LAST 4 CHARACTERS (`{oldTail}`), never by value;
 *   - the new key is captured from the reveal dialog (DOM to file, Copy + wl-paste
 *     as the fallback), never typed or echoed;
 *   - when a step is ambiguous the agent stops and reports instead of guessing.
 *
 * Modes:
 *   two-phase  create the new key (old still works), switch consumers, then revoke the old one
 *   roll       the site replaces the key in place: the old one dies on create (no overlap)
 *   report     the agent only checks the key is listed and reports; nothing is created or revoked
 */

export type DesktopMode = "two-phase" | "roll" | "report";

export interface DesktopRecipe {
  id: string;
  title: string;
  /** Where the keys are listed. */
  url: string;
  mode: DesktopMode;
  /** How the page shows a key, so the agent can find the one ending in {oldTail}. */
  locate: string;
  /** Steps to create the new key, up to the dialog that shows the new key (the capture steps follow). */
  create: string[];
  /** Steps to delete one key, identified by {tail}. Absent: never revoked by automation. */
  revoke?: string[];
  /** Why the old key is never revoked automatically (shown as the revoke note). */
  revokeNote?: string;
  /** A rough shape check for the captured value (never a full validation). */
  pattern?: string;
  /** Who reads this kind of key (used in steps). */
  family: string;
  /** What breaks during a rotation (roll mode). */
  disruptive?: string;
}

const KEEP = "Never touch any other key. If more than one key ends in {tail}, or you cannot tell which one it is, stop and report ambiguous.";

export const DESKTOP_RECIPES: Record<string, DesktopRecipe> = {
  openai: {
    id: "openai",
    title: "OpenAI API key",
    url: "https://platform.openai.com/api-keys",
    mode: "two-phase",
    family: "ai",
    pattern: "^sk-[A-Za-z0-9_-]{20,}$",
    locate: "The API keys table masks each secret key like sk-...abcd: the old key is the row whose masked key ends in {oldTail}. Note its project and permissions.",
    create: [
      "Click \"Create new secret key\".",
      "Name it {name}. Choose the same owner type, project and permissions as the old key (the row ending in {oldTail}).",
      "Click \"Create secret key\". Leave the dialog that shows the new key open."
    ],
    revoke: [
      "Find the row whose masked key ends in {tail}. Click its delete (trash) icon and confirm \"Revoke key\".",
      KEEP
    ]
  },
  elevenlabs: {
    id: "elevenlabs",
    title: "ElevenLabs API key",
    url: "https://elevenlabs.io/app/settings/api-keys",
    mode: "two-phase",
    family: "ai",
    pattern: "^(sk_)?[A-Za-z0-9]{24,}$",
    locate: "The API keys list shows each key's name and its last characters: the old key is the one ending in {oldTail}. Note its permissions and credit limit.",
    create: [
      "Click \"Create API key\" (or \"Create Key\").",
      "Name it {name}. Give it the same permissions (endpoint access) and credit limit as the old key ending in {oldTail}.",
      "Create it. Leave the dialog that shows the new key open."
    ],
    revoke: ["Open the menu (three dots) on the key ending in {tail}, choose Delete, and confirm.", KEEP]
  },
  "brave-search": {
    id: "brave-search",
    title: "Brave Search API key",
    url: "https://api-dashboard.search.brave.com/app/keys",
    mode: "two-phase",
    family: "ai",
    pattern: "^[A-Za-z0-9_-]{20,}$",
    locate: "The API Keys page lists each key with a masked token: the old key is the one ending in {oldTail} (reveal is not needed). Note which subscription it belongs to.",
    create: [
      "Click \"Add API key\".",
      "Name it {name} and pick the same subscription as the old key ending in {oldTail}.",
      "Save. Leave the new key's token shown (reveal it if the page hides it)."
    ],
    revoke: ["On the key ending in {tail}, click the delete (trash) icon and confirm.", KEEP]
  },
  civitai: {
    id: "civitai",
    title: "Civitai API key",
    url: "https://civitai.com/user/account",
    mode: "two-phase",
    family: "ai",
    pattern: "^[A-Za-z0-9]{24,}$",
    locate: "Scroll to the \"API Keys\" section. Civitai lists keys by name and creation date; if it shows the last characters, the old key ends in {oldTail}. If you cannot tell which listed key is the old one, stop and report ambiguous.",
    create: [
      "In \"API Keys\", click \"Add API key\".",
      "Name it {name} and save.",
      "Leave the dialog that shows the new key open."
    ],
    revoke: ["In \"API Keys\", delete the key identified as {tail} (the old key you located before), and confirm.", KEEP]
  },
  "cloudflare-global-api-key": {
    id: "cloudflare-global-api-key",
    title: "Cloudflare Global API Key",
    url: "https://dash.cloudflare.com/profile/api-tokens",
    mode: "roll",
    family: "cloudflare",
    pattern: "^[a-f0-9]{37}$",
    disruptive: "Cloudflare has one Global API Key per user: changing it kills the old one at once, so consumers fail until they restart",
    locate: "Under \"API Keys\", the \"Global API Key\" row. There is exactly one; the current key ends in {oldTail}.",
    create: [
      "On the \"Global API Key\" row click \"Change\" (it may ask for the account password or a captcha: if it does, stop and report needs-login).",
      "Confirm the change. Leave the new key shown."
    ],
    revokeNote: "changing the Global API Key already killed the old one"
  },
  anthropic: {
    id: "anthropic",
    title: "Anthropic API key",
    url: "https://console.anthropic.com/settings/keys",
    mode: "report",
    family: "ai",
    locate: "The API keys table masks each key like sk-ant-api03-...abcd: the old key is the row ending in {oldTail}. Report its name, workspace and \"last used\" date.",
    create: [],
    revokeNote: "Anthropic keys run the agents themselves: report-only, a person creates the new key and revokes the old one"
  },
  "claude-oauth": {
    id: "claude-oauth",
    title: "Claude OAuth token",
    url: "https://claude.ai/settings/claude-code",
    mode: "report",
    family: "ai",
    locate: "The page lists Claude Code sessions and long-lived tokens. Report whether one created for this key (or ending in {oldTail}, if tails are shown) is listed, and when it was created.",
    create: [],
    revokeNote: "a Claude OAuth token signs in the agents themselves: report-only, never revoked by automation (a person runs claude setup-token, stores it, then revokes the old one)"
  }
};

/** Placeholders in recipe text: {oldTail}, {tail}, {name}. */
export function fillRecipe(text: string, vars: Record<string, string>): string {
  return text.replace(/\{(\w+)\}/g, (m, k: string) => (k in vars ? vars[k]! : m));
}

/** The human steps for a recipe, for the plan (no desktop host needed to read them). */
export function recipeSteps(r: DesktopRecipe): string[] {
  const vars = { oldTail: "<last 4 of the old key>", tail: "<last 4 of the old key>", name: "logicsrc <key> <date>" };
  if (r.mode === "report") return [`Open ${r.url}.`, fillRecipe(r.locate, vars), r.revokeNote ?? "Report only."];
  return [
    `Open ${r.url} in a browser signed in to the provider (on a W3BS desktop: the layer's agent browser).`,
    fillRecipe(r.locate, vars),
    ...r.create.map((s) => fillRecipe(s, vars)),
    "Copy the new key (the site's Copy button) without pasting it anywhere else.",
    "Store it: logicsrc teams rotate-keys <team> <project> <env> --key <KEY> --set-from-stdin --approve.",
    "Redeploy every consumer the plan lists, check each health URL.",
    ...(r.revoke ? ["Then revoke the old key:", ...r.revoke.map((s) => fillRecipe(s, vars))] : [r.revokeNote ?? ""])
  ].filter(Boolean);
}
