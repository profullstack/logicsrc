// One vault: its secret names (which the server can see) and, once the member
// pastes their identity key, the values (which it cannot). Decryption happens
// in public/vault.js with the same libsodium calls the CLI makes; the key is
// checked against the public key the server holds before anything is opened,
// and it is never sent anywhere.
import { esc } from "./html.mjs";

const VAULT_SEP = "--";

/** `<project>--<env>` back into its parts, as the CLI's splitVaultName does. */
export function splitVaultName(name) {
  const at = name.indexOf(VAULT_SEP);
  if (at <= 0) return null;
  const env = name.slice(at + VAULT_SEP.length);
  if (!env || env.includes(VAULT_SEP)) return null;
  return { project: name.slice(0, at), env };
}

const when = (ms) => (ms ? new Date(Number(ms)).toISOString().slice(0, 16).replace("T", " ") : "—");

/** How to get the key onto the clipboard, for the machine that ran `logicsrc login`. */
export const KEY_HELP = `<details class="key-help" style="margin-top:12px">
  <summary class="dim" style="cursor:pointer;font-size:.85rem">Where do I find my key?</summary>
  <div style="font-size:.85rem;margin-top:8px">
    <p class="dim" style="margin:0 0 8px">It is the identity secret key the <code>logicsrc</code> CLI created the first time you ran <code>logicsrc login</code>. It lives only on that machine, in <code>~/.config/logicsrc/identity.json</code>. On that machine, run:</p>
    <pre class="mono" style="margin:0 0 8px">logicsrc teams key</pre>
    <p class="dim" style="margin:0 0 8px">That needs CLI 0.5.0 or later (<code>curl -fsSL https://logicsrc.com/install.sh | sh -s -- update</code>). On an older CLI, either of these prints the same thing:</p>
    <pre class="mono" style="margin:0 0 8px">jq -r .keys.secretKey ~/.config/logicsrc/identity.json
node -p 'require(require("os").homedir()+"/.config/logicsrc/identity.json").keys.secretKey'</pre>
    <p class="dim" style="margin:0">Pasting the whole <code>identity.json</code> works too; only <code>secretKey</code> is read. Installs from before the config move keep it at <code>~/.logicsrc/identity.json</code>. Anyone holding this key can read every vault you can, so treat it like a password.</p>
  </div>
</details>`;

function keyCard({ publicKey, hasGrant, grantCommand }) {
  if (!publicKey) {
    // No identity registered yet: offer to make one here. Only in this state --
    // replacing a registered key would orphan every grant sealed to the old one.
    return `<div class="card" id="vault-key" style="margin-bottom:18px"><div class="card-head"><span class="h">Read the values</span></div>
      <div class="card-body">
        <p class="dim" style="margin-top:0;font-size:.88rem">You have no identity key yet, so no vault can be shared with you. Values are encrypted to a key only you hold. Make one in either place:</p>
        <ul class="dim" style="font-size:.88rem;padding-left:18px">
          <li>In a terminal: <code>curl -fsSL https://logicsrc.com/install.sh | sh</code>, then <code>logicsrc login</code>. Then <code>logicsrc teams key</code> prints the key to paste here.</li>
          <li>Or here in this browser:</li>
        </ul>
        <button class="btn acid" type="button" data-action="generate">Create a key in this browser</button>
        <div data-role="generated" hidden style="margin-top:12px">
          <div class="notice ok">Your identity key. Save it in your password manager <b>now</b>. It is shown once, and nobody, including us, can recover it:</div>
          <pre class="mono" data-role="generated-key" style="word-break:break-all;white-space:pre-wrap"></pre>
          <p class="dim" style="font-size:.85rem">Next, a teammate who can already read this vault runs <code>${esc(grantCommand)}</code>. Then reload this page.</p>
        </div>
        <p data-role="status" class="dim mono" style="font-size:.8rem;margin-bottom:0"></p>
      </div></div>`;
  }
  return `<div class="card" id="vault-key" style="margin-bottom:18px"><div class="card-head"><span class="h">Read the values</span><span class="pill" data-role="state">locked</span></div>
    <div class="card-body">
      ${hasGrant ? "" : `<div class="notice err">You have not been granted this vault yet, so your key cannot open it. Ask a member who can to run <code>${esc(grantCommand)}</code>.</div>`}
      <form data-role="unlock" autocomplete="off">
        <label class="field"><span>Your identity key</span>
          <input type="password" name="key" placeholder="paste your secret key or identity.json" spellcheck="false" autocomplete="off" required></label>
        <label class="dim" style="display:flex;gap:8px;align-items:center;font-size:.85rem;margin:8px 0 12px"><input type="checkbox" name="remember" style="width:auto"> Remember on this device. Otherwise it is forgotten when this tab closes.</label>
        <button class="btn acid">Unlock</button>
      </form>
      <div data-role="unlocked" hidden><div style="display:flex;gap:8px;flex-wrap:wrap;align-items:center">
        <span class="dim" style="font-size:.88rem;flex:1">Key loaded. Values were decrypted in this browser. Nothing was sent.</span>
        <button class="btn" type="button" data-action="download">Download .env</button>
        <button class="btn danger" type="button" data-action="forget">Forget key</button>
      </div></div>
      <p data-role="status" class="mono" style="font-size:.8rem;margin-bottom:0;color:var(--danger,#c23a3a)"></p>
      ${KEY_HELP}
    </div></div>`;
}

/**
 * The page body below the app bar. `secrets` are rows of credshare_secrets
 * (name, version, updated_at only — ciphertext is fetched by vault.js).
 */
export function vaultPageBody({ team, vault, secrets, hasGrant, publicKey, email }) {
  const parts = splitVaultName(vault.name);
  const grantCommand = `logicsrc teams grant ${team.slug} ${parts ? `${parts.project} ${parts.env}` : "<project> <env>"} ${email || "<your email>"}`;
  const rows = secrets.map((s) => `<tr data-key-name="${esc(s.name)}">
      <td><code>${esc(s.name)}</code></td>
      <td class="secret-value"><span class="faint mono">••••••••</span></td>
      <td class="faint">${Number(s.version) || 1}</td>
      <td class="faint mono" style="font-size:.78rem;white-space:nowrap">${esc(when(s.updated_at))}</td>
    </tr>`).join("");
  return `<main class="wrap" style="max-width:920px;padding-top:26px;padding-bottom:40px"
      data-vault-id="${esc(vault.id)}" data-vault-name="${esc(vault.name)}"
      data-public-key="${esc(publicKey || "")}" data-has-grant="${hasGrant ? "1" : "0"}">
    <p class="faint mono" style="font-size:.8rem;margin:0 0 6px"><a href="/dashboard">teams</a> / ${esc(team.slug)} / vaults</p>
    <div class="section-title"><h1 style="font-size:1.5rem"><code>${esc(vault.name)}</code></h1><span class="count">${secrets.length}</span></div>
    ${keyCard({ publicKey, hasGrant, grantCommand })}
    <div class="card"><div class="card-body">
      ${secrets.length
        ? `<div class="table-scroll"><table><thead><tr><th>Name</th><th>Value</th><th>v</th><th>Updated (UTC)</th></tr></thead><tbody>${rows}</tbody></table></div>`
        : `<p class="faint mono" style="font-size:.82rem;margin:0">This vault is empty. Push to it from the CLI: <code>logicsrc teams push ${esc(team.slug)} ${parts ? `${esc(parts.project)} ${esc(parts.env)}` : "&lt;project&gt; &lt;env&gt;"}</code></p>`}
    </div></div>
  </main>
  <script src="/vendor/libsodium.js" defer></script>
  <script src="/vendor/libsodium-wrappers.js" defer></script>
  <script src="/vault.js" defer></script>`;
}
