// /keyring: copy a public key, or decrypt a private key IN THIS TAB and save it.
//
// The derivation is OpenCreds' (packages/opencreds/src/kdf.ts + vault-key.ts +
// items.ts), over WebCrypto, exactly as the CLI does it:
//   master  = PBKDF2-SHA256(passphrase, meta.kdfSalt, meta.kdfIterations)
//   wrap    = HKDF-SHA256(master, info "<ns>:vault:wrap:v1")
//   userKey = AES-GCM-open(wrap, meta.protectedUserKeyIv, meta.protectedUserKey)
//   item    = AES-GCM-open(userKey, env.iv, env.ciphertext, AAD "<ns>:vault:item:<v>:<id>")
// The passphrase, the user key and the private key never leave this page.
(() => {
  const b64 = (s) => Uint8Array.from(atob(s), (c) => c.charCodeAt(0));
  const enc = new TextEncoder();
  const REGISTERED = ["opencreds", "marksyncr"];
  const MIN_ITERATIONS = 100000;

  async function userKeyFrom(meta, passphrase) {
    if (!REGISTERED.includes(meta.namespace)) throw new Error("Unknown keyring namespace.");
    if (meta.kdf !== "pbkdf2-sha256" || !(meta.kdfIterations >= MIN_ITERATIONS)) throw new Error("Refusing weak or unknown KDF parameters.");
    const pw = await crypto.subtle.importKey("raw", enc.encode(passphrase), "PBKDF2", false, ["deriveBits"]);
    const master = await crypto.subtle.deriveBits({ name: "PBKDF2", salt: b64(meta.kdfSalt), iterations: meta.kdfIterations, hash: "SHA-256" }, pw, 256);
    const hk = await crypto.subtle.importKey("raw", master, "HKDF", false, ["deriveBits"]);
    const wrapBits = await crypto.subtle.deriveBits({ name: "HKDF", hash: "SHA-256", salt: new Uint8Array(0), info: enc.encode(`${meta.namespace}:vault:wrap:v1`) }, hk, 256);
    const wrap = await crypto.subtle.importKey("raw", wrapBits, "AES-GCM", false, ["decrypt"]);
    try {
      return await crypto.subtle.decrypt({ name: "AES-GCM", iv: b64(meta.protectedUserKeyIv) }, wrap, b64(meta.protectedUserKey));
    } catch {
      throw new Error("Wrong keyring passphrase.");
    }
  }

  async function openEnvelope(meta, userKeyBytes, env) {
    const key = await crypto.subtle.importKey("raw", userKeyBytes, "AES-GCM", false, ["decrypt"]);
    const aad = enc.encode(`${meta.namespace}:vault:item:${env.v || 1}:${env.id}`);
    const plain = await crypto.subtle.decrypt({ name: "AES-GCM", iv: b64(env.iv), additionalData: aad }, key, b64(env.ciphertext));
    const item = JSON.parse(new TextDecoder().decode(plain));
    if (item.id !== env.id) throw new Error("Envelope id mismatch.");
    return String(item.key?.privateKey || "");
  }

  // Loaded outside a page (the test suite): expose the crypto and stop.
  if (typeof document === "undefined") {
    globalThis.__logicsrcKeyring = { userKeyFrom, openEnvelope };
    return;
  }
  const status = document.getElementById("kr-status");
  const say = (msg) => { if (status) status.textContent = msg; };

  function askPassphrase(file) {
    return new Promise((resolve) => {
      const dlg = document.createElement("dialog");
      dlg.innerHTML = `<form method="dialog" style="display:flex;flex-direction:column;gap:10px;min-width:280px">
        <label class="label">Keyring passphrase for <code></code></label>
        <input type="password" autocomplete="current-password" required>
        <div style="display:flex;gap:8px;justify-content:flex-end"><button class="btn" value="cancel" formnovalidate>Cancel</button><button class="btn acid" value="ok">Decrypt</button></div>
      </form>`;
      dlg.querySelector("code").textContent = file;
      document.body.appendChild(dlg);
      const input = dlg.querySelector("input");
      dlg.addEventListener("close", () => {
        const value = dlg.returnValue === "ok" ? input.value : null;
        input.value = "";
        dlg.remove();
        resolve(value);
      });
      dlg.showModal();
      input.focus();
    });
  }

  function save(name, text) {
    const url = URL.createObjectURL(new Blob([text.endsWith("\n") ? text : text + "\n"], { type: "application/octet-stream" }));
    const a = Object.assign(document.createElement("a"), { href: url, download: name });
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  // "Share public keys": create / rotate / revoke the read-only link. The token
  // comes back once, from POST; the page shows it until it is reloaded.
  const box = document.getElementById("kr-share");
  async function shareCall(method) {
    const res = await fetch("/api/keyring/share", {
      method,
      credentials: "same-origin",
      headers: { accept: "application/json", "x-csrf-token": box?.dataset.csrf || "" }
    });
    const body = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(body.error || `The server answered ${res.status}.`);
    return body;
  }
  function shareView({ exists, url, keysUrl, state }) {
    if (!box) return;
    box.dataset.exists = exists ? "1" : "0";
    box.querySelector("[data-kr-share=create]").hidden = exists;
    box.querySelector("[data-kr-share=rotate]").hidden = !exists;
    box.querySelector("[data-kr-share=revoke]").hidden = !exists;
    box.querySelector("[data-kr-share-state]").textContent = state;
    const wrap = box.querySelector("[data-kr-share-url]");
    wrap.hidden = !url;
    box.querySelector("[data-kr-share-json]").value = url || "";
    box.querySelector("[data-kr-share-keys]").value = keysUrl || "";
  }

  document.addEventListener("click", async (ev) => {
    const shareBtn = ev.target.closest("[data-kr-share]");
    if (shareBtn) {
      const action = shareBtn.dataset.krShare;
      try {
        if (action === "revoke") {
          if (!confirm("Revoke the share link? Apps that read it (w3bs.org/fleet, threatcrush.com/fleet) lose access to your public keys.")) return;
          await shareCall("DELETE");
          shareView({ exists: false, state: "Share link revoked. No share link now." });
          return;
        }
        if (action === "rotate" && !confirm("Rotate the share link? The current URL stops working at once; paste the new one wherever you used the old one.")) return;
        const out = await shareCall("POST");
        shareView({ exists: true, url: out.url, keysUrl: out.keys_url_text, state: action === "rotate" ? "Rotated: the old URL no longer works." : "Share link created." });
      } catch (e) {
        shareView({ exists: box?.dataset.exists === "1", state: e.message || String(e) });
      }
      return;
    }
    const shareCopy = ev.target.closest("[data-kr-share-copy]");
    if (shareCopy) {
      const input = box?.querySelector(shareCopy.dataset.krShareCopy === "keys" ? "[data-kr-share-keys]" : "[data-kr-share-json]");
      await navigator.clipboard.writeText(input ? input.value : "");
      say("Share URL copied.");
      return;
    }
    const copy = ev.target.closest("[data-kr-copy]");
    if (copy) {
      const pre = document.querySelector(`[data-kr-pub="${CSS.escape(copy.dataset.krCopy)}"]`);
      await navigator.clipboard.writeText(pre ? pre.textContent.trim() : "");
      say("Public key copied.");
      return;
    }
    const dl = ev.target.closest("[data-kr-download]");
    if (!dl) return;
    const file = dl.dataset.krFile || "id_key";
    const passphrase = await askPassphrase(file);
    if (!passphrase) return;
    try {
      say("Deriving the key (600,000 PBKDF2 rounds)…");
      const res = await fetch("/api/keyring?include=envelopes", { credentials: "same-origin", headers: { accept: "application/json" } });
      if (!res.ok) throw new Error(`The server answered ${res.status}.`);
      const { meta, entries } = await res.json();
      const entry = entries.find((e) => e.id === dl.dataset.krDownload && !e.deletedAt);
      if (!meta || !entry?.envelope) throw new Error("That key is no longer in the keyring.");
      const userKey = await userKeyFrom(meta, passphrase);
      const privateKey = await openEnvelope(meta, userKey, entry.envelope);
      save(file, privateKey);
      say(`Decrypted ${file} in this tab and saved it. Put it in ~/.ssh and run: chmod 600 ~/.ssh/${file}`);
    } catch (e) {
      say(e.message || String(e));
    }
  });
})();
