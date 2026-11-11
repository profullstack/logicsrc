// App grant consent (/grant) and the /apps revoke buttons.
//
// The value is decrypted HERE with the member's identity key (same libsodium
// calls as vault.js), sealed with @profullstack/sealed-secrets to the app's
// per-user inbox key, and only the sealed text is posted. The identity key and
// the plaintext never leave this page.
import { createSealer } from "/vendor/sealed-secrets/index.js";

const STORE = "logicsrc.identityKey";
const $ = (s) => document.querySelector(s);

for (const b of document.querySelectorAll("[data-revoke]")) {
  b.addEventListener("click", async () => {
    if (!confirm("Revoke this key from the app? Rotate it too if it may have been used.")) return;
    await fetch(`/api/v1/app-grants/${encodeURIComponent(b.dataset.revoke)}`, { method: "DELETE", credentials: "same-origin" });
    location.reload();
  });
}

const main = $("#grant");
if (main) {
  const status = $("#grant-status");
  const say = (m) => (status.textContent = m || "");
  const requestId = main.dataset.requestId;
  const registered = main.dataset.publicKey;
  const recipient = JSON.parse(main.dataset.recipient);
  const returnUrl = main.dataset.returnUrl;

  const saved = () => {
    try {
      return sessionStorage.getItem(STORE) || localStorage.getItem(STORE) || "";
    } catch {
      return "";
    }
  };
  const parseKey = (raw) => {
    let t = String(raw || "").trim();
    if (t.startsWith("{")) {
      const j = JSON.parse(t);
      t = (j.keys && j.keys.secretKey) || j.secretKey || "";
    }
    return t.replace(/^["']|["']$/g, "").replace(/\s+/g, "");
  };
  const getJSON = async (url) => {
    const res = await fetch(url, { credentials: "same-origin", headers: { accept: "application/json" } });
    const body = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(body.error || `HTTP ${res.status}`);
    return body;
  };
  const postJSON = async (url, data) => {
    const res = await fetch(url, { method: "POST", credentials: "same-origin", headers: { "content-type": "application/json", accept: "application/json" }, body: JSON.stringify(data) });
    const body = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(body.error || `HTTP ${res.status}`);
    return body;
  };

  async function openVault(vaultId, secretKeyB64) {
    if (!window.sodium) throw new Error("The crypto library did not load. Reload the page.");
    const na = await window.sodium.ready.then(() => window.sodium);
    const V = na.base64_variants.ORIGINAL;
    const sk = na.from_base64(secretKeyB64, V);
    const pk = na.crypto_scalarmult_base(sk);
    if (na.to_base64(pk, V) !== registered) throw new Error("That key does not match the identity registered for your account.");
    const g = await getJSON(`/api/credshare/vaults/${encodeURIComponent(vaultId)}/grant`);
    const dek = na.crypto_box_seal_open(na.from_base64(g.wrappedDek, V), pk, sk);
    const body = await getJSON(`/api/credshare/vaults/${encodeURIComponent(vaultId)}/secrets`);
    const out = {};
    for (const s of body.secrets || []) {
      out[s.name] = { fingerprint: s.fingerprint, open: () => na.to_string(na.crypto_secretbox_open_easy(na.from_base64(s.ciphertext, V), na.from_base64(s.nonce, V), dek)) };
    }
    return out;
  }

  $("#grant-approve").addEventListener("click", async () => {
    const btn = $("#grant-approve");
    btn.disabled = true;
    try {
      const vaultId = $("#grant-vault").value;
      if (!vaultId) throw new Error("Pick a vault.");
      const key = parseKey($("#grant-key").value || saved());
      if (!key) throw new Error("Paste your identity key.");
      say("Opening the vault in this browser…");
      const secrets = await openVault(vaultId, key);
      const sealer = createSealer({ app: recipient.app, scope: recipient.scope });
      const deliveries = [];
      for (const row of document.querySelectorAll("tr[data-key]")) {
        const keyName = row.dataset.key;
        const source = row.querySelector("input[name=src]").value.trim();
        const s = secrets[source];
        if (!s) throw new Error(`No secret named ${source} in that vault.`);
        // Same shape the app's own secrets page stores: sealed:v2:<inbox entry>, field = the app's key name.
        const entry = await sealer.sealToInbox(recipient.inbox_public_key, { [keyName]: s.open() }, recipient.user_id);
        deliveries.push({ key_name: keyName, vault_id: vaultId, source_name: source, fingerprint: s.fingerprint, sealed: `sealed:v2:${JSON.stringify(entry)}` });
      }
      say("Sealed. Sending…");
      const r = await postJSON(`/api/v1/app-grants/requests/${encodeURIComponent(requestId)}/approve`, { deliveries });
      const failed = r.delivered.filter((d) => !d.delivered);
      say(failed.length ? `Granted, but the app did not take ${failed.map((d) => d.key_name).join(", ")} yet (${failed[0].error}). It retries on the next rotation; you can also revoke on /apps.` : "Done. Returning to the app…");
      if (!failed.length) setTimeout(() => (location.href = r.return_url || returnUrl), 800);
    } catch (e) {
      say(e.message);
      btn.disabled = false;
    }
  });

  $("#grant-deny").addEventListener("click", async () => {
    const r = await postJSON(`/api/v1/app-grants/requests/${encodeURIComponent(requestId)}/deny`, {}).catch(() => ({}));
    location.href = r.return_url || returnUrl;
  });
}
