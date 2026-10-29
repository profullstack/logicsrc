import { spawn } from "node:child_process";
import { randomBytes } from "node:crypto";
import { DESKTOP_RECIPES, fillRecipe, type DesktopRecipe } from "./desktop-recipes.js";
import type { Minted, ProviderRotator, RotatorContext } from "./rotators.js";

/**
 * `method: "desktop"`: rotate a dashboard-only provider key by driving the
 * signed-in browser on a W3BS Agentic Desktop Layer host.
 *
 *   1. ssh <host> w3bs-desktop status       agent access must be enabled (tray)
 *   2. ssh <host> claude -p  (create job)   in the layer's own agent browser
 *                                           (TronBrowser, DevTools channel; the
 *                                           everyday Firefox is not in the agent's
 *                                           grants) finds the old key by its LAST 4
 *                                           chars, creates the new key, and writes it
 *                                           to ~/.cache/rot/<id> (mode 600) straight
 *                                           from the reveal dialog's DOM through a
 *                                           shell pipeline whose output never reaches
 *                                           the agent; the site's Copy button plus
 *                                           wl-paste is the fallback
 *   3. ssh <host> cat ~/.cache/rot/<id>     the CLI reads it into memory; the
 *                                           caller writes vaults, propagates,
 *                                           health-checks (rotate-keys.ts)
 *   4. ssh <host> claude -p  (revoke job)   only after consumers are healthy
 *   5. ssh <host> shred -u ~/.cache/rot/<id>
 *
 * The remote agent is told only the old key's tail, never a value, and it never
 * types or prints the new value. Nothing here prints a value; errors carry
 * result codes only.
 *
 * A person at the desk wins: when the layer's input lease is held, or the agent
 * refuses because someone is typing, the key comes back `busy` (retry later),
 * not failed. A roll recipe (Cloudflare Global API Key: the old key dies on
 * create) runs only with --allow-roll AND after a capture self-test in the same
 * run proved the DOM-to-file path on a scratch page holding a random nonce.
 */

export interface RunResult {
  status: number | null;
  stdout: string;
  stderr: string;
}

/** Runs one shell command on a host (ssh). Tests pass a fake. */
export type DesktopExec = (host: string, command: string, opts?: { input?: string; timeoutMs?: number }) => Promise<RunResult>;

export class DesktopError extends Error {
  constructor(
    message: string,
    readonly code: "layer-disabled" | "no-layer" | "unreachable" | "needs-login" | "busy" | "ambiguous" | "not-found" | "bad-capture" | "roll-refused" | "agent-failed"
  ) {
    super(message);
  }
}

/** The session the desktop layer runs in (Wayland + user D-Bus), for a non-interactive ssh. */
export const DESKTOP_ENV =
  'export PATH="$HOME/.local/bin:$PATH" XDG_RUNTIME_DIR="/run/user/$(id -u)" WAYLAND_DISPLAY="${WAYLAND_DISPLAY:-wayland-0}" DBUS_SESSION_BUS_ADDRESS="unix:path=/run/user/$(id -u)/bus";';

/**
 * Exactly what the remote agent may do: drive the desktop and its agent browser
 * (MCP or `w3bs desktop browser call`), write a captured value to a file
 * (jq / wl-paste), clear the clipboard, check a file's size.
 */
export const DESKTOP_TOOLS = [
  '"mcp__w3bs-desktop__*"',
  '"Bash(w3bs:*)"',
  '"Bash(jq:*)"',
  '"Bash(mkdir:*)"',
  '"Bash(wl-paste:*)"',
  '"Bash(wl-copy:*)"',
  '"Bash(chmod:*)"',
  '"Bash(wc:*)"'
];

const AGENT_TIMEOUT = 15 * 60_000;

export const defaultDesktopExec: DesktopExec = (host, command, opts = {}) =>
  new Promise((resolve) => {
    const child = spawn("ssh", ["-o", "BatchMode=yes", "-o", "ConnectTimeout=15", host, command], { stdio: ["pipe", "pipe", "pipe"] });
    let stdout = "";
    let stderr = "";
    const timer = setTimeout(() => child.kill("SIGTERM"), opts.timeoutMs ?? 60_000);
    child.stdout.on("data", (d) => (stdout += d));
    child.stderr.on("data", (d) => (stderr += d));
    child.on("error", (e) => {
      clearTimeout(timer);
      resolve({ status: null, stdout, stderr: stderr || e.message });
    });
    child.on("close", (status) => {
      clearTimeout(timer);
      resolve({ status, stdout, stderr });
    });
    child.stdin.end(opts.input ?? "");
  });

/** The desktop host: --desktop, else LOGICSRC_DESKTOP_HOST. */
export function desktopHost(option: string | undefined, env: Record<string, string | undefined>): string | undefined {
  const h = (option || env.LOGICSRC_DESKTOP_HOST || "").trim();
  if (!h) return undefined;
  if (!/^[A-Za-z0-9._@-]+$/.test(h)) throw new Error(`--desktop must be an ssh host alias (got ${JSON.stringify(h)})`);
  return h;
}

export function tail(value: string): string {
  return value.slice(-4);
}

/** Job ids go into a remote path: keep them boring. */
function jobId(key: string): string {
  return `${key.toLowerCase().replace(/[^a-z0-9]+/g, "-").slice(0, 40)}-${randomBytes(4).toString("hex")}`;
}

const RESULT = /^ROTATION_RESULT:\s*([a-z-]+)\s*(.*)$/m;

/** The agent's last ROTATION_RESULT line. Anything else is a failure. */
export function parseAgentResult(stdout: string): { code: string; detail: string } {
  const lines = stdout.split(/\r?\n/).filter((l) => RESULT.test(l));
  const m = lines.length ? RESULT.exec(lines[lines.length - 1]!) : null;
  return m ? { code: m[1]!, detail: m[2]!.trim().slice(0, 200) } : { code: "none", detail: "" };
}

const BROWSER =
  "Work only in the desktop layer's agent browser (TronBrowser, driven through the w3bs-desktop browser tools / `w3bs desktop browser call browser_*`). If it is not running, start it with `w3bs desktop browser launch`. Never use or focus Firefox or any other window.";

const RULES = [
  "Rules (all of them, always):",
  "- Use only the w3bs-desktop tools to see and drive the screen and the agent browser, and only the shell commands named here.",
  "- Prefer the browser's DOM tools (snapshot, click by uid) over screenshots and coordinates; re-observe before every click.",
  "- Never type, read aloud, print, describe or summarise any API key value, and never let one appear in your own output. Identify keys only by their last 4 characters.",
  "- If you hit a login page, a 2FA/passkey prompt, a captcha or a password confirmation, stop at once and finish with: ROTATION_RESULT: needs-login <site>",
  "- If a person is using the desktop (the input lease is held, the layer reports busy, or you see live typing), do not take over: change nothing and finish with: ROTATION_RESULT: busy",
  "- If a step is ambiguous (two candidate keys, a missing button, an unexpected dialog), do nothing destructive and finish with: ROTATION_RESULT: ambiguous <what>",
  "- If the key you are told to find is not listed, finish with: ROTATION_RESULT: not-found",
  "- Finish with exactly one line starting ROTATION_RESULT: (codes: ok, needs-login, busy, ambiguous, not-found, error)."
];

/** How the agent gets a value shown in the page into a file without ever seeing it. */
export function captureSteps(file: string, what: string): string[] {
  return [
    `Save ${what} to ${file} WITHOUT the value passing through your own output. Preferred: one shell pipeline that reads it from the page's DOM and writes it straight to the file, for example`,
    `   mkdir -p ~/.cache/rot && w3bs desktop browser call browser_evaluate_script '{"function":"() => <expression returning the text of the input/code element that holds it>"}' --json | jq -r '<path to the returned string>' > ${file} && chmod 600 ${file} && wc -c < ${file}`,
    "   (look up the element with a DOM snapshot first; use the tool and JSON path the browser channel really has; the command's own output must be only the byte count).",
    `   Fallback only if that is impossible: click the site's Copy button, then: mkdir -p ~/.cache/rot && wl-paste -n > ${file} && chmod 600 ${file} && wc -c < ${file} ; then clear the clipboard: wl-copy --clear`,
    `   The byte count must be more than 0; if it is 0, try the other way once, then finish with: ROTATION_RESULT: error capture`
  ];
}

export function createPrompt(r: DesktopRecipe, vars: { oldTail: string; name: string; file: string }): string {
  const create = r.create.map((s) => fillRecipe(s, vars));
  return [
    `Task: rotate the ${r.title} on ${r.url}.`,
    BROWSER,
    `1. Open ${r.url} in the agent browser (new tab). The provider login must already exist in that browser profile; if it does not, finish with ROTATION_RESULT: needs-login.`,
    `2. ${fillRecipe(r.locate, vars)}`,
    ...create.map((s, i) => `${i + 3}. ${s}`),
    `${create.length + 3}. While the dialog shows the new key:`,
    ...captureSteps(vars.file, "the new key"),
    `${create.length + 4}. Close the dialog. Finish with: ROTATION_RESULT: ok`,
    "",
    ...RULES
  ].join("\n");
}

/** Proves the capture path on a scratch page holding a random nonce: no provider, no key. */
export function selfTestPrompt(nonce: string, file: string): string {
  const page = `data:text/html,<title>logicsrc capture test</title><input id="k" readonly value="${nonce}"><button onclick="navigator.clipboard.writeText(document.getElementById('k').value)">Copy</button>`;
  return [
    "Task: a capture self-test. No account and no real key are involved.",
    BROWSER,
    `1. Open this page in the agent browser (new tab): ${page}`,
    "2. The input with id k holds a test value.",
    ...captureSteps(file, "the input's value"),
    "3. Close the tab. Finish with: ROTATION_RESULT: ok",
    "",
    ...RULES
  ].join("\n");
}

export function revokePrompt(r: DesktopRecipe, vars: { tail: string; keepTail: string }): string {
  return [
    `Task: revoke one ${r.title} on ${r.url}.`,
    BROWSER,
    `1. Open ${r.url} in the agent browser (new tab).`,
    `2. First confirm that a key ending in ${vars.keepTail} is listed (the new key). If it is not, change nothing and finish with: ROTATION_RESULT: not-found new key`,
    ...(r.revoke ?? []).map((s, i) => `${i + 3}. ${fillRecipe(s, vars)}`),
    `${(r.revoke?.length ?? 0) + 3}. NEVER delete the key ending in ${vars.keepTail}. Finish with: ROTATION_RESULT: ok`,
    "",
    ...RULES
  ].join("\n");
}

export function reportPrompt(r: DesktopRecipe, vars: { oldTail: string }): string {
  return [
    `Task: report on one ${r.title} on ${r.url}. Look only; change nothing.`,
    BROWSER,
    `1. Open ${r.url} in the agent browser (new tab).`,
    `2. ${fillRecipe(r.locate, vars)}`,
    "3. Do not create, edit or delete anything. Finish with: ROTATION_RESULT: ok <name, created and last-used, no values>",
    "",
    ...RULES
  ].join("\n");
}

export interface DesktopDeps {
  host: string;
  exec?: DesktopExec;
  /** Roll recipes (old key dies on create) run only with this (--allow-roll). */
  allowRoll?: boolean;
  /** Shared by every desktop key in one run: one status check, one capture self-test. */
  session?: DesktopSession;
}

export interface DesktopSession {
  status?: Promise<DesktopProblem | null>;
  /** Set once a capture (self-test or a real create) round-tripped in this run. */
  captureProven?: boolean;
}

export interface DesktopProblem {
  code: DesktopError["code"];
  message: string;
}

/** null when the layer accepts agents right now, else why not. */
export function desktopStatus(host: string, exec: DesktopExec, session: DesktopSession = {}): Promise<DesktopProblem | null> {
  session.status ??= checkStatus(host, exec);
  return session.status;
}

async function checkStatus(host: string, exec: DesktopExec): Promise<DesktopProblem | null> {
  const r = await exec(host, `${DESKTOP_ENV} w3bs-desktop status 2>&1`, { timeoutMs: 30_000 });
  const out = `${r.stdout}\n${r.stderr}`;
  if (r.status === 255 || r.status === null) return { code: "unreachable", message: `cannot reach desktop host ${host} over ssh (${(r.stderr.trim().split("\n").pop() ?? "").slice(0, 120)})` };
  if (r.status === 127 || /command not found/.test(out)) return { code: "no-layer", message: `the W3BS Agentic Desktop Layer (w3bs-desktop) is not installed on ${host}` };
  if (/Agent access:\s*DISABLED/i.test(out) || r.status === 4)
    return { code: "layer-disabled", message: `the W3BS Agentic Desktop Layer on ${host} has agent access DISABLED: enable it from the W3BS tray icon on ${host} (Agent access: on), then run this again` };
  if (r.status !== 0) return { code: "no-layer", message: `w3bs-desktop status failed on ${host} (exit ${r.status})` };
  // Someone at the desk holds the input lease: their turn, not ours.
  const lease = /Input lease:\s*(.+)/i.exec(out)?.[1]?.trim() ?? "free";
  if (!/^free\b/i.test(lease)) return { code: "busy", message: `the desktop on ${host} is in use (input lease: ${lease.slice(0, 60)}): retry later` };
  return null;
}

function problemError(p: DesktopProblem): DesktopError {
  return new DesktopError(p.message, p.code);
}

async function readCapture(host: string, exec: DesktopExec, file: string): Promise<string> {
  const read = await exec(host, `cat ${file}`, { timeoutMs: 30_000 });
  return read.status === 0 ? read.stdout.replace(/\r?\n$/, "").trim() : "";
}

/**
 * Before a roll (no way back), prove the capture path: the agent saves a random
 * nonce from a scratch page through the same DOM/clipboard path, and the CLI
 * compares it. A real two-phase capture earlier in the run proves it too.
 */
export async function captureSelfTest(host: string, exec: DesktopExec, session: DesktopSession): Promise<void> {
  if (session.captureProven) return;
  const nonce = randomBytes(18).toString("hex");
  const file = `~/.cache/rot/selftest-${randomBytes(4).toString("hex")}`;
  try {
    const res = await runAgent(host, exec, selfTestPrompt(nonce, file));
    if (res.code !== "ok") raise(res, "capture self-test");
    const got = await readCapture(host, exec, file);
    if (got !== nonce) throw new DesktopError(`capture self-test read back ${got ? `a different value (${got.length} chars)` : "nothing"}: the capture path is not proven`, "bad-capture");
    session.captureProven = true;
  } finally {
    await shred(host, exec, file);
  }
}

async function runAgent(host: string, exec: DesktopExec, prompt: string): Promise<{ code: string; detail: string }> {
  const cmd = `${DESKTOP_ENV} claude -p --output-format text --allowedTools ${DESKTOP_TOOLS.join(" ")}`;
  const r = await exec(host, cmd, { input: prompt, timeoutMs: AGENT_TIMEOUT });
  const res = parseAgentResult(r.stdout);
  // The layer's "busy" exit (another holder of the input lease) without a result line.
  if (res.code === "none" && r.status === 5) return { code: "busy", detail: "input lease held" };
  if (res.code === "none") {
    throw new DesktopError(`desktop agent on ${host} gave no result (exit ${r.status}${r.stderr ? `: ${r.stderr.trim().slice(0, 160)}` : ""})`, "agent-failed");
  }
  return res;
}

function raise(res: { code: string; detail: string }, what: string): never {
  const msg = `${what}: ${res.code}${res.detail ? ` (${res.detail})` : ""}`;
  if (res.code === "needs-login") throw new DesktopError(msg, "needs-login");
  if (res.code === "busy") throw new DesktopError(`${msg}: a person is using the desktop, retry later`, "busy");
  if (res.code === "ambiguous") throw new DesktopError(msg, "ambiguous");
  if (res.code === "not-found") throw new DesktopError(msg, "not-found");
  throw new DesktopError(msg, "agent-failed");
}

async function shred(host: string, exec: DesktopExec, file: string): Promise<string | undefined> {
  const r = await exec(host, `shred -u ${file} 2>/dev/null || rm -f ${file}; test ! -e ${file}`, { timeoutMs: 30_000 });
  return r.status === 0 ? undefined : `remove ${host}:${file} by hand (shred -u)`;
}

/**
 * A ProviderRotator for one desktop recipe, so rotate-keys runs it through the
 * same two-phase flow (vaults, --propagate, health, rollback) as API rotators.
 */
export function desktopRotator(recipeId: string, deps: DesktopDeps): ProviderRotator {
  const recipe = DESKTOP_RECIPES[recipeId];
  const exec = deps.exec ?? defaultDesktopExec;
  const host = deps.host;
  const session = deps.session ?? {};
  return {
    id: `desktop:${recipeId}`,
    title: recipe ? `${recipe.title} (desktop ${host})` : recipeId,
    overlap: recipe?.mode === "two-phase",
    async preflight(ctx) {
      if (!recipe) return `unknown desktop recipe ${recipeId}`;
      if (recipe.mode === "report") return `${recipe.title}: report-only (${recipe.revokeNote})`;
      if (ctx.oldValue.length < 8) return "the old value is too short to identify by its last 4 characters";
      if (recipe.mode === "roll" && !deps.allowRoll)
        return `${recipe.title} rolls in place (the old key dies at once): pass --allow-roll to let the desktop agent change it (a capture self-test runs first)`;
      const p = await desktopStatus(host, exec, session);
      // A person at the desk is a wait, not a todo: the caller reports it as busy.
      if (p?.code === "busy") throw problemError(p);
      return p ? p.message : null;
    },
    async mint(ctx: RotatorContext): Promise<Minted> {
      if (!recipe || recipe.mode === "report") throw new DesktopError(`${recipeId} cannot be minted on the desktop`, "agent-failed");
      const p = await desktopStatus(host, exec, session);
      if (p) throw problemError(p);
      if (recipe.mode === "roll") {
        if (!deps.allowRoll) throw new DesktopError(`${recipe.title} rolls in place: needs --allow-roll`, "roll-refused");
        await captureSelfTest(host, exec, session);
      }
      const id = jobId(ctx.key);
      const file = `~/.cache/rot/${id}`;
      const oldTail = tail(ctx.oldValue);
      const name = `logicsrc ${ctx.key.toLowerCase()} ${ctx.now.toISOString().slice(0, 10)}`;
      let value = "";
      try {
        const res = await runAgent(host, exec, createPrompt(recipe, { oldTail, name, file }));
        if (res.code !== "ok") raise(res, `create ${recipe.title}`);
        value = await readCapture(host, exec, file);
        if (!value) throw new DesktopError(`the desktop agent saved nothing to ${host}:${file}`, "bad-capture");
        if (value === ctx.oldValue) throw new DesktopError("the captured key is the OLD key (the agent copied the wrong one)", "bad-capture");
        if (/\s/.test(value) || value.length < 16 || (recipe.pattern && !new RegExp(recipe.pattern).test(value))) {
          throw new DesktopError(`the captured value (${value.length} chars) does not look like a ${recipe.title}`, "bad-capture");
        }
        session.captureProven = true;
      } catch (err) {
        await shred(host, exec, file);
        // A key may have been created before the failure: say so, with its name, never its value.
        if (err instanceof DesktopError && err.code === "bad-capture") err.message += `; delete the key named "${name}" at ${recipe.url} if it was created`;
        throw err;
      }
      const newTail = tail(value);
      return {
        value,
        state: { desktopKeyName: name, desktopTail: newTail },
        async revokeOld() {
          try {
            if (recipe.mode === "roll") return undefined; // the roll already killed it
            if (!recipe.revoke) return `${recipe.title}: ${recipe.revokeNote ?? "revoke the old key by hand"} (old key ends in ${oldTail})`;
            if (newTail === oldTail) return `old and new ${recipe.title}s both end in ${oldTail}: revoke the old one by hand at ${recipe.url} (keep "${name}")`;
            const res = await runAgent(host, exec, revokePrompt(recipe, { tail: oldTail, keepTail: newTail }));
            if (res.code === "ok") return undefined;
            return `revoking the old ${recipe.title} (ends in ${oldTail}) failed on the desktop (${res.code}${res.detail ? `: ${res.detail}` : ""}): it is still live, delete it at ${recipe.url}`;
          } finally {
            const left = await shred(host, exec, file);
            if (left) console.error(`Warning: ${left}`);
          }
        },
        async rollback() {
          const notes: string[] = [];
          try {
            if (recipe.mode === "roll") {
              notes.push(`${recipe.title} cannot be changed back: the new key is live, keep it and finish redeploying the consumers`);
            } else if (recipe.revoke && newTail !== oldTail) {
              const res = await runAgent(host, exec, revokePrompt(recipe, { tail: newTail, keepTail: oldTail })).catch((e: Error) => ({ code: "error", detail: e.message }));
              if (res.code !== "ok") notes.push(`delete the new ${recipe.title} "${name}" (ends in ${newTail}) at ${recipe.url} by hand`);
            } else {
              notes.push(`delete the new ${recipe.title} "${name}" at ${recipe.url} by hand`);
            }
          } finally {
            const left = await shred(host, exec, file);
            if (left) notes.push(left);
          }
          return notes.length ? notes.join("; ") : undefined;
        }
      };
    }
  };
}

/** Report-only recipes: look the key up on the desktop, change nothing. */
export async function desktopReport(recipeId: string, oldValue: string, deps: DesktopDeps): Promise<string> {
  const recipe = DESKTOP_RECIPES[recipeId];
  if (!recipe) return `unknown desktop recipe ${recipeId}`;
  const exec = deps.exec ?? defaultDesktopExec;
  const p = await desktopStatus(deps.host, exec, deps.session ?? {});
  if (p) throw problemError(p);
  const res = await runAgent(deps.host, exec, reportPrompt(recipe, { oldTail: tail(oldValue) }));
  if (res.code === "needs-login" || res.code === "busy") raise(res, `report ${recipe.title}`);
  return `desktop report (${res.code}): ${res.detail || "no detail"}. ${recipe.revokeNote ?? ""}`.trim();
}
