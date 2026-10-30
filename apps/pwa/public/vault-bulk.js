/* Unlock every team vault granted to the signed-in person from the dashboard.
   The identity key and plaintext stay in this tab; the server returns only
   wrapped keys and ciphertext. */
(function () {
  var card = document.getElementById("vault-bulk");
  if (!card) return;

  var form = card.querySelector("[data-role=bulk-unlock]");
  var keyInput = form.elements.key;
  var running = card.querySelector("[data-role=bulk-running]");
  var progress = card.querySelector("[data-role=bulk-progress]");
  var results = card.querySelector("[data-role=bulk-results]");
  var summary = card.querySelector("[data-role=bulk-summary]");
  var search = card.querySelector("[data-role=bulk-search]");
  var rows = card.querySelector("[data-role=bulk-rows]");
  var more = card.querySelector('[data-action="bulk-more"]');
  var status = card.querySelector("[data-role=bulk-status]");
  var records = [];
  var controller = null;
  var pageSize = 100;

  function say(message) { status.textContent = message || ""; }

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

  function getJSON(url, signal) {
    return fetch(url, {
      credentials: "same-origin",
      headers: { accept: "application/json" },
      cache: "no-store",
      signal: signal
    }).then(function (res) {
      return res.json().catch(function () { return {}; }).then(function (body) {
        if (!res.ok) throw new Error(body.error || ("HTTP " + res.status));
        return body;
      });
    });
  }

  function zero(na, bytes) {
    if (bytes && na.memzero) na.memzero(bytes);
  }

  function renderRows() {
    var query = String(search.value || "").trim().toLowerCase();
    var matching = records.filter(function (record) {
      return !query || (record.team + " " + record.vault + " " + record.name).toLowerCase().includes(query);
    });
    var shown = Math.min(pageSize, matching.length);
    rows.replaceChildren();
    matching.slice(0, shown).forEach(function (record) {
      var tr = document.createElement("tr");
      [record.team, record.vault, record.name].forEach(function (text) {
        var td = document.createElement("td");
        var code = document.createElement("code");
        code.textContent = text;
        td.appendChild(code);
        tr.appendChild(td);
      });

      var valueCell = document.createElement("td");
      var value = document.createElement("code");
      value.className = "mono";
      value.textContent = "••••••••";
      valueCell.appendChild(value);
      tr.appendChild(valueCell);

      var actions = document.createElement("td");
      actions.style.whiteSpace = "nowrap";
      var show = document.createElement("button");
      show.type = "button";
      show.className = "btn compact";
      show.textContent = "Show";
      var revealed = false;
      show.addEventListener("click", function () {
        revealed = !revealed;
        value.textContent = revealed ? record.value : "••••••••";
        show.textContent = revealed ? "Hide" : "Show";
      });
      actions.appendChild(show);

      var copy = document.createElement("button");
      copy.type = "button";
      copy.className = "btn compact";
      copy.textContent = "Copy";
      copy.style.marginLeft = "5px";
      copy.addEventListener("click", function () {
        navigator.clipboard.writeText(record.value).then(function () {
          copy.textContent = "Copied";
          setTimeout(function () { copy.textContent = "Copy"; }, 1200);
        }, function () { say("Clipboard is blocked here; use Show and copy manually."); });
      });
      actions.appendChild(copy);
      tr.appendChild(actions);
      rows.appendChild(tr);
    });
    summary.textContent = "Showing " + shown + " of " + matching.length + " matching secrets · " + records.length + " unlocked total.";
    more.hidden = shown >= matching.length;
    if (!more.hidden) more.textContent = "Show next " + Math.min(100, matching.length - shown);
  }

  function clearAll(message) {
    records = [];
    search.value = "";
    rows.replaceChildren();
    summary.textContent = "";
    results.hidden = true;
    running.hidden = true;
    form.hidden = false;
    keyInput.value = "";
    controller = null;
    say(message);
  }

  async function unlockEveryGrant(secretKeyB64, signal) {
    if (!window.sodium) throw new Error("The crypto library did not load. Reload the page.");
    var na = await window.sodium.ready.then(function () { return window.sodium; });
    var V = na.base64_variants.ORIGINAL;
    var sk;
    var pk;
    try {
      try { sk = na.from_base64(secretKeyB64, V); }
      catch (_) { throw new Error("That is not a base64 identity key."); }
      if (sk.length !== na.crypto_box_SECRETKEYBYTES) {
        throw new Error("That key is " + sk.length + " bytes; an identity key is " + na.crypto_box_SECRETKEYBYTES + ".");
      }
      pk = na.crypto_scalarmult_base(sk);

      var me = await getJSON("/api/credshare/me", signal);
      var registered = me.user && me.user.publicKey;
      if (!registered) throw new Error("No identity key is registered for your account yet. Run `logicsrc login` first.");
      if (na.to_base64(pk, V) !== registered) {
        throw new Error("That identity key does not match this account. Use the key from the last machine that ran `logicsrc login`.");
      }

      var grantBody = await getJSON("/api/credshare/me/grants", signal);
      var grants = grantBody.grants || [];
      if (!grants.length) throw new Error("No team vaults have been granted to your account yet.");

      var next = 0;
      var finished = 0;
      var opened = 0;
      var failedVaults = 0;
      var failedSecrets = 0;
      var out = [];
      progress.textContent = "Opening " + grants.length + " granted vaults…";

      async function worker() {
        while (!signal.aborted) {
          var index = next++;
          if (index >= grants.length) return;
          var grant = grants[index];
          var dek = null;
          try {
            try {
              dek = na.crypto_box_seal_open(na.from_base64(grant.wrappedDek, V), pk, sk);
            } catch (_) {
              failedVaults++;
              finished++;
              progress.textContent = "Opening vault " + finished + " of " + grants.length + "…";
              continue;
            }
            var body = await getJSON("/api/credshare/vaults/" + encodeURIComponent(grant.vaultId) + "/secrets", signal);
            opened++;
            (body.secrets || []).forEach(function (secret) {
              try {
                out.push({
                  team: String(grant.team || ""),
                  vault: String(grant.vault || ""),
                  name: String(secret.name || ""),
                  value: na.to_string(na.crypto_secretbox_open_easy(
                    na.from_base64(secret.ciphertext, V), na.from_base64(secret.nonce, V), dek
                  ))
                });
              } catch (_) { failedSecrets++; }
            });
          } catch (_) {
            if (signal.aborted) return;
            failedVaults++;
          } finally {
            zero(na, dek);
          }
          finished++;
          progress.textContent = "Opened " + opened + " of " + grants.length + " vaults…";
        }
      }

      await Promise.all(Array.from({ length: Math.min(6, grants.length) }, worker));
      if (signal.aborted) return { cancelled: true, records: [] };
      out.sort(function (a, b) {
        return a.team.localeCompare(b.team) || a.vault.localeCompare(b.vault) || a.name.localeCompare(b.name);
      });
      return { records: out, opened: opened, total: grants.length, failedVaults: failedVaults, failedSecrets: failedSecrets };
    } finally {
      zero(na, pk);
      zero(na, sk);
    }
  }

  form.addEventListener("submit", function (event) {
    event.preventDefault();
    var secretKey;
    try { secretKey = parseKey(keyInput.value); }
    catch (error) { say(error.message); return; }
    keyInput.value = "";
    say("");
    form.hidden = true;
    results.hidden = true;
    running.hidden = false;
    controller = new AbortController();
    var current = controller;
    unlockEveryGrant(secretKey, current.signal).then(function (result) {
      if (current.signal.aborted || result.cancelled) {
        clearAll("Stopped and cleared. No values were kept.");
        return;
      }
      records = result.records;
      running.hidden = true;
      results.hidden = false;
      search.value = "";
      pageSize = 100;
      renderRows();
      say(result.opened + " of " + result.total + " vaults opened" +
        (result.failedVaults ? "; " + result.failedVaults + " vault(s) unavailable" : "") +
        (result.failedSecrets ? "; " + result.failedSecrets + " value(s) could not decrypt" : "") + ".");
      controller = null;
    }).catch(function (error) {
      if (current.signal.aborted) {
        clearAll("Stopped and cleared. No values were kept.");
        return;
      }
      running.hidden = true;
      form.hidden = false;
      controller = null;
      say(error.message || "Could not unlock the vaults.");
    });
  });

  search.addEventListener("input", function () { pageSize = 100; renderRows(); });
  more.addEventListener("click", function () { pageSize += 100; renderRows(); });
  card.addEventListener("click", function (event) {
    var action = event.target && event.target.getAttribute && event.target.getAttribute("data-action");
    if (action === "bulk-stop" && controller) controller.abort();
    else if (action === "bulk-lock") clearAll("Locked and cleared.");
  });
})();
