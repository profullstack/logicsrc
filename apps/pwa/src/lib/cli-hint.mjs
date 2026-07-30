// The "Connect the CLI" card on the teams dashboard.
//
// It lives here rather than beside the page that renders it because it hands
// out commands people paste into a shell, and commands that are wrong are worse
// than absent. Keeping it dep-free is what lets a test assert on the rendered
// text without standing up express and the database.
import { esc } from "./html.mjs";

// Mirror of DEFAULT_API_URL in plugins/credential-sharing/src/identity.ts. The
// CLI already points here on its own, so telling a user to set LOGICSRC_API to
// this exact value is a no-op that reads like a required step. Only a
// self-hosted origin needs the prefix -- keep the two values in sync.
export const CLI_DEFAULT_API = "https://app.logicsrc.com";

/**
 * @param {string} origin - the origin this request arrived on
 * @returns {string} the card's HTML
 */
// Vaults are addressed as <team> <project> <env> -- three positionals. Anything
// shorter exits with "missing required argument", so a hint that omits one is
// not merely stale, it fails on paste. `--env <path>` is the local .env file
// and already defaults to .env; spelling it out here only invites confusion
// with the <env> positional next to it.
export const CLI_HINT = (origin) => `<div class="card" style="margin-bottom:22px"><div class="card-head"><span class="h">Connect the CLI</span><span class="pill on">end-to-end encrypted</span></div>
  <div class="card-body">
    <p class="dim" style="margin-top:0;font-size:.9rem">Secrets are encrypted on your machine — decrypt them with the <code>logicsrc</code> CLI, never here.</p>
    <pre class="mono" style="background:var(--surface-2);border:1px solid var(--line);border-radius:8px;padding:12px;overflow:auto;font-size:.8rem;margin:0">${origin === CLI_DEFAULT_API ? "" : `LOGICSRC_API=${esc(origin)} `}logicsrc login
logicsrc teams push &lt;team&gt; &lt;project&gt; &lt;env&gt;   # share
logicsrc teams pull &lt;team&gt; &lt;project&gt; &lt;env&gt;   # receive</pre>
  </div></div>`;
