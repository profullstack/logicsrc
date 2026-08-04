// Teams dashboard (/) + accept-invite (/teams/accept) + settings (/settings).
// The browser holds no private key, so it never decrypts — it manages teams,
// members, vaults (ciphertext metadata), invites, and CLI API keys.
import { Router } from "express";
import { get, all, run } from "../db.mjs";
import { id, sha256 } from "../lib/crypto.mjs";
import { page, footer, appBar, esc } from "../lib/html.mjs";
import { requireAuth, csrfInput } from "../lib/session.mjs";
import { createApiKey, listApiKeys, revokeApiKey } from "../lib/apikey.mjs";
import { requestOrigin } from "../lib/origin.mjs";
import { CLI_HINT } from "../lib/cli-hint.mjs";
import { config } from "../config.mjs";
import {
  TeamMemberError,
  canManageMember,
  issueTeamInvite,
  changeMemberRole,
  removeTeamMember
} from "../lib/team-members.mjs";

export const pagesRouter = Router();

// placeholder replaced per-request (teamCard can't see req to render csrfInput)
const CSRF = "__CSRF__";

async function teamCard(team, uid) {
  const members = await all(`SELECT * FROM credshare_members WHERE team_id = ? ORDER BY created_at`, [team.id]);
  const me = members.find((m) => m.user_id === uid);
  const vaults = await all(`SELECT * FROM credshare_vaults WHERE team_id = ? ORDER BY name`, [team.id]);
  const canInvite = me && (me.role === "owner" || me.role === "admin");

  const memberRows = [];
  for (const m of members) {
    const key = m.user_id ? await get(`SELECT 1 FROM credshare_keys WHERE user_id = ?`, [m.user_id]) : null;
    const roleControl = me.role === "owner"
      ? `<form method="post" action="/teams/${esc(team.slug)}/members/${esc(m.id)}/role" class="member-role-form">${CSRF}
          <select name="role" aria-label="Permission for ${esc(m.email)}">
            ${["owner", "admin", "member"].map((role) => `<option value="${role}"${m.role === role ? " selected" : ""}>${role}</option>`).join("")}
          </select><button class="btn compact">Save</button></form>`
      : `<span class="pill">${esc(m.role)}</span>`;
    const canResend = m.status === "invited" && (me.role === "owner" || (me.role === "admin" && m.role === "member"));
    const actions = [
      canResend ? `<form method="post" action="/teams/${esc(team.slug)}/members/${esc(m.id)}/resend" style="margin:0">${CSRF}<button class="btn compact">Resend</button></form>` : "",
      canManageMember(me, m) ? `<form method="post" action="/teams/${esc(team.slug)}/members/${esc(m.id)}/delete" style="margin:0" onsubmit="return confirm('Remove this team member?')">${CSRF}<button class="btn compact danger">Remove</button></form>` : ""
    ].filter(Boolean).join("");
    memberRows.push(`<tr><td>${esc(m.email)}</td><td>${roleControl}</td><td><span class="pill ${m.status === "active" ? "on" : "warn"}">${esc(m.status)}</span></td><td>${key ? "✓" : "—"}</td><td><div class="member-actions">${actions || "—"}</div></td></tr>`);
  }
  const vaultRows = [];
  for (const v of vaults) {
    const count = await get(`SELECT COUNT(*) AS n FROM credshare_secrets WHERE vault_id = ?`, [v.id]);
    const mine = await get(`SELECT 1 FROM credshare_vault_grants WHERE vault_id = ? AND user_id = ?`, [v.id, uid]);
    vaultRows.push(`<tr><td><code>${esc(v.name)}</code></td><td>${Number(count?.n || 0)}</td><td>${mine ? "✓ you have access" : "— ask a member to grant you"}</td></tr>`);
  }

  return `<div class="card" style="margin-bottom:22px">
    <div class="card-head"><span class="h">${esc(team.name)} <span class="faint">/${esc(team.slug)}</span></span><span class="pill">${me ? esc(me.role) : "member"}</span></div>
    <div class="card-body">
      <div class="label" style="margin-bottom:6px">Members</div>
      <div class="table-scroll"><table><thead><tr><th>Email</th><th>Permission</th><th>Status</th><th>Key</th><th>Actions</th></tr></thead><tbody>${memberRows.join("")}</tbody></table></div>
      ${canInvite ? `<form method="post" action="/teams/${esc(team.slug)}/invite" style="display:flex;gap:8px;margin-top:12px">${CSRF}
        <input type="email" name="email" placeholder="teammate@example.com" required style="flex:1">
        ${me.role === "owner" ? `<select name="role" aria-label="Permission" style="width:auto"><option value="member">member</option><option value="admin">admin</option><option value="owner">owner</option></select>` : `<input type="hidden" name="role" value="member">`}
        <button class="btn">Invite</button></form>` : ""}
      <div class="label" style="margin:18px 0 6px">Vaults</div>
      ${vaults.length ? `<table><thead><tr><th>Vault</th><th>Secrets</th><th>Your access</th></tr></thead><tbody>${vaultRows.join("")}</tbody></table>`
        : `<p class="faint mono" style="font-size:.82rem">No vaults yet — create one from the CLI: <code>logicsrc teams push ${esc(team.slug)} &lt;project&gt; &lt;env&gt;</code></p>`}
    </div></div>`;
}

export async function dashboardHandler(req, res) {
  const uid = req.user.id;
  const teams = await all(`SELECT t.* FROM credshare_teams t JOIN credshare_members m ON m.team_id = t.id WHERE m.user_id = ? AND m.status = 'active' ORDER BY t.created_at`, [uid]);
  let cards = "";
  for (const t of teams) cards += await teamCard(t, uid);
  cards = cards.split(CSRF).join(csrfInput(req));

  const notices = {
    "member-updated": "Member permissions updated.",
    "member-removed": "Team member removed.",
    "invite-resent": "Invite replaced with a new key.",
  };
  const errors = {
    "already-member": "That person is already an active team member.",
    "bad-email": "Enter a valid email address.",
    "bad-role": "Choose a valid permission.",
    "last-owner": "A team must keep at least one active owner.",
    "member-not-found": "That team member no longer exists.",
    "not-allowed": "You do not have permission to make that change.",
  };
  const ok = notices[String(req.query.ok || "")];
  const err = errors[String(req.query.err || "")];
  const rotation = req.query.rotation === "1";

  const body = `${appBar(req)}
  <main class="wrap" style="max-width:820px;padding:26px 0 40px">
    <div class="section-title"><h1 style="font-size:1.6rem">Your teams</h1><span class="count">${teams.length}</span></div>
    ${ok ? `<div class="notice ok">${esc(ok)}${rotation ? " Vault grants were revoked; rotate affected vault keys before re-adding this person." : ""}</div>` : ""}
    ${err ? `<div class="notice err">${esc(err)}</div>` : ""}
    ${CLI_HINT(requestOrigin(req, config.origin))}
    ${cards || `<div class="card"><div class="card-body dim">You're not on any teams yet. Create one below or accept an invite.</div></div>`}
    <div class="card" style="margin-top:22px"><div class="card-head"><span class="h">New team</span></div>
      <div class="card-body"><form method="post" action="/teams" style="display:flex;gap:8px">${csrfInput(req)}
        <input name="slug" placeholder="team-slug" required style="flex:1"><button class="btn acid">Create team</button></form></div></div>
  </main>${footer}`;
  res.type("html").send(page({ title: "LogicSRC ▸ teams", body }));
}

pagesRouter.get("/dashboard", requireAuth, dashboardHandler);

// ---- team + invite form actions (session + CSRF) ----
pagesRouter.post("/teams", requireAuth, async (req, res) => {
  const slug = String(req.body.slug || "").trim().toLowerCase();
  if (!/^[a-z0-9][a-z0-9-]{0,62}$/.test(slug)) return res.redirect("/dashboard?err=bad-slug");
  if (await get(`SELECT 1 FROM credshare_teams WHERE slug = ?`, [slug])) return res.redirect("/dashboard?err=slug-taken");
  const teamId = id(), now = Date.now();
  await run(`INSERT INTO credshare_teams (id, slug, name, created_by, created_at) VALUES (?,?,?,?,?)`, [teamId, slug, slug, req.user.id, now]);
  await run(`INSERT INTO credshare_members (id, team_id, user_id, email, role, status, joined_at, created_at) VALUES (?,?,?,?,?,?,?,?)`,
    [id(), teamId, req.user.id, String(req.user.email || req.user.id).toLowerCase(), "owner", "active", now, now]);
  res.redirect("/dashboard");
});

pagesRouter.post("/teams/:slug/invite", requireAuth, async (req, res) => {
  const team = await get(`SELECT * FROM credshare_teams WHERE slug = ?`, [req.params.slug]);
  const me = team && await get(`SELECT * FROM credshare_members WHERE team_id = ? AND user_id = ?`, [team.id, req.user.id]);
  if (!team || !me) return res.redirect("/dashboard?err=not-allowed");
  try {
    const result = await issueTeamInvite({
      team,
      actor: { ...me, email: req.user.email },
      email: req.body.email,
      role: req.body.role
    });
    return res.redirect("/teams/accept?token=" + encodeURIComponent(result.token) + "&shared=1");
  } catch (error) {
    if (error instanceof TeamMemberError) return res.redirect("/dashboard?err=" + encodeURIComponent(error.code));
    throw error;
  }
});

async function teamMemberContext(req) {
  const team = await get(`SELECT * FROM credshare_teams WHERE slug = ?`, [req.params.slug]);
  const actor = team && await get(`SELECT * FROM credshare_members WHERE team_id = ? AND user_id = ? AND status = 'active'`, [team.id, req.user.id]);
  return team && actor ? { team, actor } : null;
}

pagesRouter.post("/teams/:slug/members/:memberId/resend", requireAuth, async (req, res) => {
  const ctx = await teamMemberContext(req);
  const target = ctx && await get(`SELECT * FROM credshare_members WHERE id = ? AND team_id = ?`, [req.params.memberId, ctx.team.id]);
  if (!ctx || !target || target.status !== "invited") return res.redirect("/dashboard?err=member-not-found");
  try {
    const result = await issueTeamInvite({
      team: ctx.team,
      actor: { ...ctx.actor, email: req.user.email },
      email: target.email,
      role: target.role
    });
    return res.redirect("/teams/accept?token=" + encodeURIComponent(result.token) + "&shared=1&resent=1");
  } catch (error) {
    if (error instanceof TeamMemberError) return res.redirect("/dashboard?err=" + encodeURIComponent(error.code));
    throw error;
  }
});

pagesRouter.post("/teams/:slug/members/:memberId/role", requireAuth, async (req, res) => {
  const ctx = await teamMemberContext(req);
  if (!ctx) return res.redirect("/dashboard?err=not-allowed");
  try {
    await changeMemberRole({ team: ctx.team, actor: ctx.actor, memberId: req.params.memberId, role: req.body.role });
    return res.redirect("/dashboard?ok=member-updated");
  } catch (error) {
    if (error instanceof TeamMemberError) return res.redirect("/dashboard?err=" + encodeURIComponent(error.code));
    throw error;
  }
});

pagesRouter.post("/teams/:slug/members/:memberId/delete", requireAuth, async (req, res) => {
  const ctx = await teamMemberContext(req);
  if (!ctx) return res.redirect("/dashboard?err=not-allowed");
  try {
    const result = await removeTeamMember({ team: ctx.team, actor: ctx.actor, memberId: req.params.memberId });
    return res.redirect(`/dashboard?ok=member-removed${result.rotationRequired ? "&rotation=1" : ""}`);
  } catch (error) {
    if (error instanceof TeamMemberError) return res.redirect("/dashboard?err=" + encodeURIComponent(error.code));
    throw error;
  }
});

// ---- accept invite ----
pagesRouter.get("/teams/accept", requireAuth, (req, res) => {
  const tok = String(req.query.token || "");
  const shared = req.query.shared;
  const resent = req.query.resent;
  const err = req.query.err;
  const body = `${appBar(req)}
  <main class="wrap" style="max-width:460px;padding-top:8vh">
    <div class="card"><div class="card-body" style="text-align:center">
      <h1 style="font-size:1.4rem;margin-bottom:12px">Accept team invite</h1>
      ${err ? `<div class="notice err">${esc(String(err).replace(/-/g, " "))}</div>` : ""}
      ${shared ? `<div class="notice ok">${resent ? "Invite replaced. The previous key is invalid; share this new link with the teammate." : "Invite created. Share this link with the teammate, or accept below if it's for you."}</div>` : ""}
      <form method="post" action="/teams/accept">${csrfInput(req)}
        <label class="field"><span>Invite token</span><input name="token" value="${esc(tok)}" required></label>
        <button class="btn acid block">Accept invite</button>
      </form>
    </div></div>
  </main>${footer}`;
  res.type("html").send(page({ title: "LogicSRC ▸ accept invite", body }));
});

pagesRouter.post("/teams/accept", requireAuth, async (req, res) => {
  const invite = await get(`SELECT * FROM credshare_invites WHERE token_hash = ?`, [sha256(String(req.body.token || ""))]);
  if (!invite || invite.accepted_at || invite.expires_at < Date.now()) return res.redirect("/teams/accept?err=invalid-or-expired");
  if (String(invite.email).toLowerCase() !== String(req.user.email || "").toLowerCase()) return res.redirect("/teams/accept?err=wrong-account");
  const now = Date.now();
  await run(`UPDATE credshare_members SET user_id = ?, status = 'active', joined_at = ? WHERE team_id = ? AND email = ?`, [req.user.id, now, invite.team_id, String(invite.email).toLowerCase()]);
  await run(`UPDATE credshare_invites SET accepted_at = ? WHERE id = ?`, [now, invite.id]);
  res.redirect("/dashboard");
});

// ---- settings: CLI API keys ----
pagesRouter.get("/settings", requireAuth, async (req, res) => {
  const keys = await listApiKeys(req.user.id);
  const newKey = req.query.key ? String(req.query.key) : "";
  const keysHtml = keys.length ? keys.map((k) => `
    <div style="display:flex;gap:12px;align-items:center;padding:10px 0;border-bottom:1px solid var(--line)" class="mono">
      <span style="flex:1">${esc(k.name)} <span class="faint">${esc(k.prefix)}…</span></span>
      <form method="post" action="/settings/apikeys/${k.id}/delete" style="margin:0">${csrfInput(req)}<button class="btn danger" style="padding:5px 10px;font-size:.72rem">revoke</button></form>
    </div>`).join("") : `<div class="faint mono" style="font-size:.78rem;padding:6px 0">no keys yet</div>`;
  const body = `${appBar(req)}
  <main class="wrap" style="max-width:640px;padding-top:30px">
    <h1 style="font-size:1.5rem;margin-bottom:20px">Settings</h1>
    ${newKey ? `<div class="notice ok">New API key (copy it now — shown once):<br><b class="mono" style="word-break:break-all">${esc(newKey)}</b></div>` : ""}
    <div class="card"><div class="card-head"><span class="h">API keys · for the logicsrc CLI</span></div>
      <div class="card-body">
        <p class="dim" style="font-size:.85rem;margin-top:0">Usually you don't need these — <code>logicsrc login</code> creates one automatically. Manual keys are for CI.</p>
        ${keysHtml}
        <form method="post" action="/settings/apikeys" style="margin-top:14px;display:flex;gap:10px">${csrfInput(req)}
          <input name="name" placeholder="key name (e.g. ci)" style="flex:1"><button class="btn">Create key</button></form>
      </div></div>
  </main>${footer}`;
  res.type("html").send(page({ title: "LogicSRC ▸ settings", body }));
});

pagesRouter.post("/settings/apikeys", requireAuth, async (req, res) => {
  const { plaintext } = await createApiKey(req.user.id, String(req.body.name || "cli").slice(0, 40));
  res.redirect("/settings?key=" + encodeURIComponent(plaintext));
});
pagesRouter.post("/settings/apikeys/:id/delete", requireAuth, async (req, res) => {
  await revokeApiKey(req.user.id, req.params.id);
  res.redirect("/settings");
});
