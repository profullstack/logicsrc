// Trust-on-first-use pins for teammates' identity keys, in this browser.
//
// The dashboard shows each member's key fingerprint (sha256 of the public key).
// The first time this browser sees a member's fingerprint it is pinned; if the
// server later shows a DIFFERENT one, the row is flagged until you accept it.
// A changed key is normal after `logicsrc teams rotate-identity` or a reset, and
// exactly what a swapped-in attacker key looks like: confirm with the person
// out of band before granting them anything. The CLI keeps its own pins
// (~/.config/logicsrc/known-keys.json) and refuses to seal to a changed key.
(function () {
  const STORE = "logicsrc.keyPins.v1";
  let pins = {};
  try { pins = JSON.parse(localStorage.getItem(STORE) || "{}") || {}; } catch (_) { pins = {}; }
  const save = () => { try { localStorage.setItem(STORE, JSON.stringify(pins)); } catch (_) { /* storage blocked: pins last this page only */ } };

  for (const el of document.querySelectorAll("code.fp[data-fp-email][data-fp]")) {
    const id = `${el.dataset.fpTeam || ""}/${el.dataset.fpEmail}`;
    const fp = el.dataset.fp;
    const known = pins[id];
    if (!known) {
      pins[id] = { fp, firstSeen: Date.now() };
      continue;
    }
    if (known.fp === fp) continue;
    el.style.color = "var(--danger)";
    const note = document.createElement("div");
    note.className = "mono";
    note.style.cssText = "font-size:.72rem;color:var(--danger);margin-top:4px";
    note.textContent = `KEY CHANGED since this browser last saw it (was ${known.fp}). Confirm with ${el.dataset.fpEmail} before granting anything. `;
    const accept = document.createElement("button");
    accept.type = "button";
    accept.className = "btn compact";
    accept.textContent = "I checked: accept";
    accept.addEventListener("click", () => {
      pins[id] = { fp, firstSeen: Date.now(), acceptedChangeFrom: known.fp };
      save();
      note.remove();
      el.style.color = "";
    });
    note.appendChild(accept);
    el.insertAdjacentElement("afterend", note);
  }
  save();
})();
