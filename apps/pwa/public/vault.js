/* Vault page: decrypt secret values in the browser with the member's identity key.
   Mirrors plugins/credential-sharing/src/crypto.ts exactly:
     DEK   = crypto_box_seal_open(wrappedDek, publicKey, secretKey)
     value = crypto_secretbox_open_easy(ciphertext, nonce, DEK)
   All base64 is the ORIGINAL variant. The key never leaves this page: it is
   checked against the public key the server holds, then used locally. */
(function () {
  var main = document.querySelector("main[data-vault-id]");
  var card = document.getElementById("vault-key");
  if (!main || !card) return;

  var vaultId = main.getAttribute("data-vault-id");
  var vaultName = main.getAttribute("data-vault-name");
  var registered = main.getAttribute("data-public-key");
  var hasGrant = main.getAttribute("data-has-grant") === "1";
  var STORE = "logicsrc.identityKey";
  var status = card.querySelector("[data-role=status]");
  var values = null; // name -> plaintext, once unlocked
  var vaultDek = null; // the vault key (bytes), once unlocked -- only ever used to seal it to a machine key
  var keysCard = document.getElementById("machine-keys");

  function say(msg) { if (status) status.textContent = msg || ""; }

  function store(kind) {
    try { return window[kind]; } catch (_) { return null; }
  }
  function readSaved() {
    var s = store("sessionStorage"), l = store("localStorage");
    try { return (s && s.getItem(STORE)) || (l && l.getItem(STORE)) || ""; } catch (_) { return ""; }
  }
  function save(key, remember) {
    try {
      var s = store("sessionStorage"), l = store("localStorage");
      if (s) s.setItem(STORE, key);
      if (l) { if (remember) l.setItem(STORE, key); else l.removeItem(STORE); }
    } catch (_) { /* private mode: the key just lasts as long as this page */ }
  }
  function forget() {
    try {
      var s = store("sessionStorage"), l = store("localStorage");
      if (s) s.removeItem(STORE);
      if (l) l.removeItem(STORE);
    } catch (_) {}
  }

  function sodium() {
    if (!window.sodium) return Promise.reject(new Error("The crypto library did not load. Reload the page."));
    return window.sodium.ready.then(function () { return window.sodium; });
  }

  // Accept the bare base64 key, the key in quotes, or the whole identity.json.
  function parseKey(raw) {
    var text = String(raw || "").trim();
    if (text.charAt(0) === "{") {
      var json;
      try { json = JSON.parse(text); } catch (_) { throw new Error("That looks like JSON but does not parse."); }
      text = (json.keys && json.keys.secretKey) || json.secretKey || "";
      if (!text) throw new Error("No keys.secretKey in that JSON.");
    }
    return text.replace(/^["']|["']$/g, "").replace(/\s+/g, "");
  }

  function getJSON(url) {
    return fetch(url, { credentials: "same-origin", headers: { accept: "application/json" } }).then(function (res) {
      return res.json().catch(function () { return {}; }).then(function (body) {
        if (!res.ok) throw new Error(body.error || ("HTTP " + res.status));
        return body;
      });
    });
  }

  /** Check the key is ours, then open the grant and every value. */
  function unlock(secretKeyB64) {
    return sodium().then(function (na) {
      var V = na.base64_variants.ORIGINAL;
      var sk;
      try { sk = na.from_base64(secretKeyB64, V); } catch (_) { throw new Error("That is not a base64 key."); }
      if (sk.length !== na.crypto_box_SECRETKEYBYTES) throw new Error("That key is " + sk.length + " bytes; an identity key is " + na.crypto_box_SECRETKEYBYTES + ".");
      var pk = na.crypto_scalarmult_base(sk);
      if (na.to_base64(pk, V) !== registered) {
        throw new Error("That key does not match the identity registered for your account. It may be from another machine. Your account uses the key from the last machine that ran logicsrc login.");
      }
      if (!hasGrant) throw new Error("Key accepted, but you have no grant for this vault yet.");
      return getJSON("/api/credshare/vaults/" + encodeURIComponent(vaultId) + "/grant").then(function (g) {
        var dek;
        try { dek = na.crypto_box_seal_open(na.from_base64(g.wrappedDek, V), pk, sk); }
        catch (_) { throw new Error("Your key cannot open this vault's grant. It was sealed to an older key, so ask a member to grant you again."); }
        return getJSON("/api/credshare/vaults/" + encodeURIComponent(vaultId) + "/secrets").then(function (body) {
          var out = {}, failed = [];
          (body.secrets || []).forEach(function (s) {
            try {
              out[s.name] = na.to_string(na.crypto_secretbox_open_easy(na.from_base64(s.ciphertext, V), na.from_base64(s.nonce, V), dek));
            } catch (_) { failed.push(s.name); }
          });
          return { values: out, failed: failed, dek: dek };
        });
      });
    });
  }

  function button(label, onClick) {
    var b = document.createElement("button");
    b.type = "button";
    b.className = "btn compact";
    b.textContent = label;
    b.addEventListener("click", onClick);
    return b;
  }

  function render(result) {
    values = result.values;
    vaultDek = result.dek || null;
    if (keysCard && vaultDek) {
      Array.prototype.forEach.call(keysCard.querySelectorAll("[data-action=grant-key]"), function (b) {
        b.disabled = false;
        b.removeAttribute("title");
      });
    }
    var rows = main.querySelectorAll("tr[data-key-name]");
    Array.prototype.forEach.call(rows, function (tr) {
      var name = tr.getAttribute("data-key-name");
      var cell = tr.querySelector(".secret-value");
      if (!cell) return;
      cell.textContent = "";
      if (!(name in values)) {
        var miss = document.createElement("span");
        miss.className = "faint mono";
        miss.textContent = "could not decrypt";
        cell.appendChild(miss);
        return;
      }
      var shown = false;
      var code = document.createElement("code");
      code.className = "mono";
      code.style.wordBreak = "break-all";
      code.textContent = "••••••••";
      var toggle = button("Show", function () {
        shown = !shown;
        code.textContent = shown ? values[name] : "••••••••";
        toggle.textContent = shown ? "Hide" : "Show";
      });
      var copy = button("Copy", function () {
        navigator.clipboard.writeText(values[name]).then(function () {
          copy.textContent = "Copied";
          setTimeout(function () { copy.textContent = "Copy"; }, 1200);
        }, function () { say("The clipboard is blocked here; use Show and copy by hand."); });
      });
      var wrap = document.createElement("div");
      wrap.style.cssText = "display:flex;gap:6px;align-items:center;flex-wrap:wrap";
      wrap.appendChild(code);
      wrap.appendChild(toggle);
      wrap.appendChild(copy);
      cell.appendChild(wrap);
    });
    var form = card.querySelector("[data-role=unlock]");
    var done = card.querySelector("[data-role=unlocked]");
    var state = card.querySelector("[data-role=state]");
    if (form) form.hidden = true;
    if (done) done.hidden = false;
    if (state) { state.textContent = "unlocked"; state.className = "pill on"; }
    say(result.failed.length ? result.failed.length + " value(s) did not decrypt: " + result.failed.join(", ") : "");
  }

  // dotenv line: bare when safe, else double-quoted with JSON escapes (\n, \", \\).
  function envLine(name, value) {
    return name + "=" + (/^[A-Za-z0-9_\-.:\/@+,]*$/.test(value) ? value : JSON.stringify(value));
  }

  card.addEventListener("click", function (e) {
    var action = e.target && e.target.getAttribute && e.target.getAttribute("data-action");
    if (action === "forget") {
      forget();
      location.reload();
    } else if (action === "download" && values) {
      var text = Object.keys(values).sort().map(function (k) { return envLine(k, values[k]); }).join("\n") + "\n";
      var a = document.createElement("a");
      a.href = URL.createObjectURL(new Blob([text], { type: "text/plain" }));
      a.download = vaultName + ".env";
      document.body.appendChild(a);
      a.click();
      setTimeout(function () { URL.revokeObjectURL(a.href); a.remove(); }, 0);
    } else if (action === "generate") {
      generate(e.target);
    }
  });

  var form = card.querySelector("[data-role=unlock]");
  if (form) {
    form.addEventListener("submit", function (e) {
      e.preventDefault();
      var key;
      try { key = parseKey(form.elements.key.value); } catch (err) { say(err.message); return; }
      say("Decrypting…");
      unlock(key).then(function (result) {
        save(key, form.elements.remember.checked);
        form.elements.key.value = "";
        render(result);
      }, function (err) { say(err.message); });
    });
    // A key from earlier in this tab (or remembered) unlocks without asking.
    var saved = readSaved();
    if (saved && registered && hasGrant) {
      unlock(saved).then(render, function (err) { forget(); say(err.message); });
    }
  }

  function csrfHeader() {
    var m = document.cookie.match(/(?:^|; )mc_csrf=([^;]+)/);
    return m ? decodeURIComponent(m[1]) : "";
  }

  function keySay(msg, bad) {
    var el = keysCard && keysCard.querySelector("[data-role=key-status]");
    if (!el) return;
    el.textContent = msg || "";
    el.style.color = bad ? "var(--danger,#c23a3a)" : "";
  }

  // Machine keys: seal the vault key to the machine's own public key, here.
  if (keysCard) {
    keysCard.addEventListener("click", function (e) {
      var btn = e.target && e.target.closest ? e.target.closest("[data-action]") : null;
      if (!btn) return;
      var action = btn.getAttribute("data-action");
      var keyId = btn.getAttribute("data-key-id");
      var url = "/api/credshare/vaults/" + encodeURIComponent(vaultId) + "/key-grants";
      if (action === "grant-key") {
        if (!vaultDek) { keySay("Unlock the vault with your key first.", true); return; }
        btn.disabled = true;
        sodium().then(function (na) {
          var V = na.base64_variants.ORIGINAL;
          var sealed = na.to_base64(na.crypto_box_seal(vaultDek, na.from_base64(btn.getAttribute("data-key-public"), V)), V);
          return fetch(url, {
            method: "POST",
            credentials: "same-origin",
            headers: { "content-type": "application/json", "x-csrf-token": csrfHeader() },
            body: JSON.stringify({ keyId: keyId, wrappedDek: sealed })
          });
        }).then(function (res) {
          return res.json().catch(function () { return {}; }).then(function (body) {
            if (!res.ok) throw new Error(body.error || ("HTTP " + res.status));
            keySay("Granted " + btn.getAttribute("data-key-name") + ". Reload to see it listed.");
            btn.textContent = "Granted";
          });
        }).catch(function (err) { btn.disabled = false; keySay(err.message, true); });
      } else if (action === "revoke-key") {
        btn.disabled = true;
        fetch(url + "/" + encodeURIComponent(keyId), {
          method: "DELETE",
          credentials: "same-origin",
          headers: { "x-csrf-token": csrfHeader() }
        }).then(function (res) {
          return res.json().catch(function () { return {}; }).then(function (body) {
            if (!res.ok) throw new Error(body.error || ("HTTP " + res.status));
            location.reload();
          });
        }).catch(function (err) { btn.disabled = false; keySay(err.message, true); });
      }
    });
  }

  // No identity registered yet: make one here and register only its public half.
  function generate(btn) {
    btn.disabled = true;
    say("Creating a key…");
    getJSON("/api/credshare/me").then(function (me) {
      // Re-check: a login elsewhere may have registered a key since this page loaded.
      if (me.user && me.user.publicKey) throw new Error("A key was registered since this page loaded. Reload and paste that one.");
      return sodium();
    }).then(function (na) {
      var V = na.base64_variants.ORIGINAL;
      var kp = na.crypto_box_keypair();
      var publicKey = na.to_base64(kp.publicKey, V), secretKey = na.to_base64(kp.privateKey, V);
      var m = document.cookie.match(/(?:^|; )mc_csrf=([^;]+)/);
      return fetch("/api/credshare/keys", {
        method: "POST",
        credentials: "same-origin",
        headers: { "content-type": "application/json", "x-csrf-token": m ? decodeURIComponent(m[1]) : "" },
        body: JSON.stringify({ publicKey: publicKey })
      }).then(function (res) {
        if (!res.ok) throw new Error("Could not register the key (HTTP " + res.status + ").");
        save(secretKey, false);
        card.querySelector("[data-role=generated-key]").textContent = secretKey;
        card.querySelector("[data-role=generated]").hidden = false;
        btn.hidden = true;
        say("");
      });
    }).catch(function (err) { btn.disabled = false; say(err.message); });
  }
})();
