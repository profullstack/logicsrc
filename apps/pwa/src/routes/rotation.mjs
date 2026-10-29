// Key rotation: the plan per key, and a queue of rotation runs.
//
//   GET  /api/credshare/teams/:slug/rotation                 the plan (never values)
//   GET  /api/credshare/teams/:slug/rotation/runs            queued / past runs (?status=queued)
//   POST /api/credshare/teams/:slug/rotation/runs            queue a run {keys, project?, env?, approve?, desktop?, propagate?, allowRoll?}
//   POST /api/credshare/teams/:slug/rotation/runs/:id/claim  a runner takes a queued run
//   POST /api/credshare/teams/:slug/rotation/runs/:id/result the runner reports per-key outcomes
//   POST /api/credshare/teams/:slug/rotation/runs/:id/cancel
//   POST /api/credshare/teams/:slug/rotation/due             queue every automatic key past the max age (90 days) as ONE run
//   POST /api/credshare/teams/:slug/rotation/runs/:id/approve an owner/admin approves an awaiting-approval run
//   GET  /teams/:slug/rotation                               the Rotation page
//
// The server only ever holds ciphertext, so it cannot rotate anything itself: a
// run is a request that a CLI or agent executes with
// `logicsrc teams rotate-keys <team> --from-queue` (the CLI decrypts, mints,
// writes the vaults and redeploys), then reports outcomes, never values.
// Queueing an APPROVED run takes an owner or admin; any member may queue a dry run.
//
// The 90-day policy: /rotation/due (the weekly job calls it) queues the overdue
// automatic keys as a run in 'awaiting-approval'. Nothing rotates until an owner
// or admin approves it here (a person, never a machine key); then the queue
// runner picks it up. A team with rotation_auto_approve (the paid automatic
// rotation add-on) gets its due runs queued already approved.
import { Router } from "express";
import { get, all, run } from "../db.mjs";
import { id } from "../lib/crypto.mjs";
import { page, footer, appBar, esc } from "../lib/html.mjs";
import { requireAuth, csrfInput } from "../lib/session.mjs";
import { keyCoversVault } from "../lib/apikey.mjs";
import { api, requireMember, audit } from "./credshare.mjs";
import { rotationPlan, parseRunRequest, sanitizeResults, runRow, summarize, RotationRunError, maxAgeDays, DUE_RUN_MAX_KEYS, OPEN_RUN_STATUSES } from "../lib/rotation.mjs";

export const rotationRouter = Router();

const isMachine = (key) => key?.kind === "machine";
const canApprove = (member) => member.role === "owner" || member.role === "admin";

async function listRuns(teamId, { status, limit = 50 } = {}) {
  const rows = await all(
    `SELECT r.*, u.email AS requested_by_email, a.email AS approved_by_email FROM credshare_rotation_runs r
       LEFT JOIN users u ON u.id = r.requested_by LEFT JOIN users a ON a.id = r.approved_by
      WHERE r.team_id = ?${status ? " AND r.status = ?" : ""} ORDER BY r.created_at DESC LIMIT ?`,
    status ? [teamId, status, limit] : [teamId, limit]
  );
  return rows.map(runRow);
}

/** One run, with the requester's and approver's emails. */
async function runWithEmails(runId) {
  return runRow(await get(
    `SELECT r.*, u.email AS requested_by_email, a.email AS approved_by_email FROM credshare_rotation_runs r
       LEFT JOIN users u ON u.id = r.requested_by LEFT JOIN users a ON a.id = r.approved_by WHERE r.id = ?`,
    [runId]
  ));
}

async function queueRun(team, member, user, body, req) {
  const r = parseRunRequest(body);
  if (r.approve && !canApprove(member)) throw new RotationRunError("Only a team owner or admin can queue an approved rotation. Queue a dry run instead.");
  const runId = id();
  await run(
    `INSERT INTO credshare_rotation_runs (id, team_id, requested_by, keys, project, env, approve, options, status, created_at) VALUES (?,?,?,?,?,?,?,?,?,?)`,
    [runId, team.id, user.id, JSON.stringify(r.keys), r.project, r.env, r.approve ? 1 : 0, JSON.stringify(r.options), "queued", Date.now()]
  );
  await audit({ req, teamId: team.id, actorUserId: user.id, action: r.approve ? "rotation.queue.approve" : "rotation.queue.dry-run", keyName: r.keys.slice(0, 5).join(",") + (r.keys.length > 5 ? ",..." : "") });
  return runRow(await get(`SELECT * FROM credshare_rotation_runs WHERE id = ?`, [runId]));
}

/**
 * Queue every automatic key past the team's max age as one run. Idempotent: while
 * a due run is still open (awaiting approval, queued or running) it is returned
 * instead of a second one. Returns { run, created, due } (run null when nothing is due).
 */
export async function queueDueRun(team, user, req, { now = Date.now(), vaultFilter } = {}) {
  const maxAge = maxAgeDays(team);
  const due = (await rotationPlan(team.id, { maxAge, now, vaultFilter })).filter((p) => p.due);
  const open = (await all(
    `SELECT * FROM credshare_rotation_runs WHERE team_id = ? AND status IN (${OPEN_RUN_STATUSES.map(() => "?").join(",")}) ORDER BY created_at DESC`,
    [team.id, ...OPEN_RUN_STATUSES]
  )).map(runRow).find((r) => r.due);
  if (open) return { run: open, created: false, due: due.length, maxAgeDays: maxAge };
  if (!due.length) return { run: null, created: false, due: 0, maxAgeDays: maxAge };
  const keys = [...new Set(due.sort((a, b) => String(a.lastRotated).localeCompare(String(b.lastRotated))).map((p) => p.key))].slice(0, DUE_RUN_MAX_KEYS);
  const auto = Boolean(Number(team.rotation_auto_approve));
  const runId = id();
  await run(
    `INSERT INTO credshare_rotation_runs (id, team_id, requested_by, keys, project, env, approve, options, status, approved_at, created_at) VALUES (?,?,?,?,?,?,?,?,?,?,?)`,
    [runId, team.id, user.id, JSON.stringify(keys), null, null, 1, JSON.stringify({ propagate: true, due: true, maxAgeDays: maxAge }), auto ? "queued" : "awaiting-approval", auto ? now : null, now]
  );
  await audit({ req, teamId: team.id, actorUserId: user.id, action: auto ? "rotation.due.auto-approved" : "rotation.due.awaiting-approval", keyName: `${keys.length} keys` });
  return { run: runRow(await get(`SELECT * FROM credshare_rotation_runs WHERE id = ?`, [runId])), created: true, due: due.length, maxAgeDays: maxAge };
}

/** Approve an awaiting-approval run: it becomes a queued, approved run. */
async function approveRun(team, member, user, runId, req) {
  if (!canApprove(member)) throw new RotationRunError("Only a team owner or admin can approve a rotation.");
  const upd = await run(
    `UPDATE credshare_rotation_runs SET status = 'queued', approve = 1, approved_by = ?, approved_at = ? WHERE id = ? AND team_id = ? AND status = 'awaiting-approval'`,
    [user.id, Date.now(), runId, team.id]
  );
  if (!Number(upd.rowsAffected)) throw new RotationRunError("That run is not waiting for approval.");
  await audit({ req, teamId: team.id, actorUserId: user.id, action: "rotation.approve", keyName: runId });
  return runWithEmails(runId);
}

rotationRouter.post("/api/credshare/teams/:slug/rotation/due", api(async (req, res, user, key) => {
  const ctx = await requireMember(res, req.params.slug, user.id, key); if (!ctx) return;
  // A machine key may ask (the weekly job does); approval stays with a person.
  if (!isMachine(key) && !canApprove(ctx.member)) return res.status(403).json({ error: "Only a team owner or admin (or a machine key) can queue the due rotations." });
  const out = await queueDueRun(ctx.team, user, req, { vaultFilter: isMachine(key) ? (name) => keyCoversVault(key, name) : undefined });
  res.status(out.created ? 201 : 200).json({ ...out, approveUrl: `/teams/${ctx.team.slug}/rotation` });
}, { machine: "write" }));

rotationRouter.post("/api/credshare/teams/:slug/rotation/runs/:id/approve", api(async (req, res, user, key) => {
  const ctx = await requireMember(res, req.params.slug, user.id, key); if (!ctx) return;
  try {
    res.json({ run: await approveRun(ctx.team, ctx.member, user, req.params.id, req) });
  } catch (e) {
    if (e instanceof RotationRunError) return res.status(409).json({ error: e.message });
    throw e;
  }
}));

rotationRouter.get("/api/credshare/teams/:slug/rotation", api(async (req, res, user, key) => {
  const ctx = await requireMember(res, req.params.slug, user.id, key); if (!ctx) return;
  const keys = req.query.key ? String(req.query.key).split(",").filter(Boolean) : undefined;
  const plan = await rotationPlan(ctx.team.id, {
    project: req.query.project ? String(req.query.project) : undefined,
    env: req.query.env ? String(req.query.env) : undefined,
    keys,
    vaultFilter: isMachine(key) ? (name) => keyCoversVault(key, name) : undefined,
    maxAge: maxAgeDays(ctx.team)
  });
  res.json({ team: ctx.team.slug, maxAgeDays: maxAgeDays(ctx.team), autoApprove: Boolean(Number(ctx.team.rotation_auto_approve)), plan, source: "catalog", note: "Computed from key names and fingerprints with the built-in catalog. Encrypted __ROTATE__ entries (hasEntry) can override it: logicsrc teams rotation shows the decrypted spec." });
}, { machine: "read" }));

rotationRouter.get("/api/credshare/teams/:slug/rotation/runs", api(async (req, res, user, key) => {
  const ctx = await requireMember(res, req.params.slug, user.id, key); if (!ctx) return;
  const status = req.query.status ? String(req.query.status) : undefined;
  res.json({ runs: await listRuns(ctx.team.id, { status, limit: Math.min(Number(req.query.limit) || 50, 200) }) });
}, { machine: "read" }));

rotationRouter.post("/api/credshare/teams/:slug/rotation/runs", api(async (req, res, user, key) => {
  const ctx = await requireMember(res, req.params.slug, user.id, key); if (!ctx) return;
  try {
    res.status(201).json({ run: await queueRun(ctx.team, ctx.member, user, req.body ?? {}, req) });
  } catch (e) {
    if (e instanceof RotationRunError) return res.status(400).json({ error: e.message });
    throw e;
  }
}));

/** Load a run of this team, or answer 404. */
async function teamRun(res, teamId, runId) {
  const r = await get(`SELECT * FROM credshare_rotation_runs WHERE id = ? AND team_id = ?`, [runId, teamId]);
  if (!r) res.status(404).json({ error: "No such rotation run." });
  return r;
}

rotationRouter.post("/api/credshare/teams/:slug/rotation/runs/:id/claim", api(async (req, res, user, key) => {
  const ctx = await requireMember(res, req.params.slug, user.id, key); if (!ctx) return;
  const r = await teamRun(res, ctx.team.id, req.params.id); if (!r) return;
  // Atomic: only one runner wins a queued run.
  const claimer = key?.id ?? user.id;
  const upd = await run(`UPDATE credshare_rotation_runs SET status = 'running', claimed_by = ?, claimed_at = ? WHERE id = ? AND status = 'queued'`, [claimer, Date.now(), r.id]);
  if (!Number(upd.rowsAffected)) return res.status(409).json({ error: `Run is ${r.status}, not queued.` });
  await audit({ req, teamId: ctx.team.id, actorUserId: user.id, action: "rotation.claim", keyName: r.id });
  res.json({ run: runRow(await get(`SELECT * FROM credshare_rotation_runs WHERE id = ?`, [r.id])) });
}, { machine: "write" }));

rotationRouter.post("/api/credshare/teams/:slug/rotation/runs/:id/result", api(async (req, res, user, key) => {
  const ctx = await requireMember(res, req.params.slug, user.id, key); if (!ctx) return;
  const r = await teamRun(res, ctx.team.id, req.params.id); if (!r) return;
  const claimer = key?.id ?? user.id;
  if (r.status !== "running" || r.claimed_by !== claimer) return res.status(409).json({ error: "Only the runner that claimed this run can report it." });
  const results = sanitizeResults(req.body?.results);
  const failed = req.body?.status === "failed" || results.some((x) => x.status === "failed" || x.status === "rolled-back");
  const summary = (typeof req.body?.error === "string" ? `${req.body.error.slice(0, 300)}; ` : "") + summarize(results);
  await run(`UPDATE credshare_rotation_runs SET status = ?, finished_at = ?, results = ?, summary = ? WHERE id = ?`, [failed ? "failed" : "done", Date.now(), JSON.stringify(results), summary, r.id]);
  await audit({ req, teamId: ctx.team.id, actorUserId: user.id, action: "rotation.result", keyName: r.id });
  res.json({ run: runRow(await get(`SELECT * FROM credshare_rotation_runs WHERE id = ?`, [r.id])) });
}, { machine: "write" }));

rotationRouter.post("/api/credshare/teams/:slug/rotation/runs/:id/cancel", api(async (req, res, user, key) => {
  const ctx = await requireMember(res, req.params.slug, user.id, key); if (!ctx) return;
  const r = await teamRun(res, ctx.team.id, req.params.id); if (!r) return;
  if (r.requested_by !== user.id && !canApprove(ctx.member)) return res.status(403).json({ error: "Only who queued it, or an owner/admin, can cancel it." });
  const upd = await run(`UPDATE credshare_rotation_runs SET status = 'cancelled', finished_at = ? WHERE id = ? AND status IN ('queued', 'awaiting-approval')`, [Date.now(), r.id]);
  if (!Number(upd.rowsAffected)) return res.status(409).json({ error: `Run is ${r.status}: only a queued or awaiting-approval run can be cancelled.` });
  res.json({ ok: true });
}));

// ---- the page --------------------------------------------------------------------------

async function pageContext(req) {
  const team = await get(`SELECT * FROM credshare_teams WHERE slug = ?`, [req.params.slug]);
  const member = team && await get(`SELECT * FROM credshare_members WHERE team_id = ? AND user_id = ? AND status = 'active'`, [team.id, req.user.id]);
  return team && member ? { team, member } : null;
}

const when = (ms) => (ms ? new Date(Number(ms)).toISOString().slice(0, 16).replace("T", " ") : "");

function planTable(plan, selectable) {
  if (!plan.length) return `<p class="faint mono" style="font-size:.82rem">No secrets to rotate in this filter.</p>`;
  const row = (p) => {
    const how = p.method === "desktop" ? `desktop: ${p.recipe}${p.desktopMode && p.desktopMode !== "two-phase" ? ` (${p.desktopMode})` : ""}` : p.method === "provider" ? `provider: ${p.provider}` : p.method;
    const pill = p.never ? `<span class="pill warn">never auto</span>` : p.automatic ? `<span class="pill on">auto</span>` : `<span class="pill">manual</span>`;
    const details = [
      p.note ? `<p>${esc(p.note)}</p>` : "",
      p.disruptive ? `<p><b>Breaks:</b> ${esc(p.disruptive)}</p>` : "",
      p.url ? `<p><a href="${esc(p.url)}" rel="noopener noreferrer" target="_blank">${esc(p.url)}</a></p>` : "",
      p.steps.length ? `<ol>${p.steps.map((s) => `<li>${esc(s)}</li>`).join("")}</ol>` : "",
      p.consumers.length ? `<p><b>Consumers:</b> ${p.consumers.map(esc).join(", ")}</p>` : "",
      `<p class="faint mono" style="font-size:.74rem">Vaults: ${p.vaults.map(esc).join(", ")}${p.alsoIn.length ? `; same value also in ${p.alsoIn.map(esc).join(", ")}` : ""}</p>`,
      p.hasEntry ? `<p class="faint">Has its own encrypted rotation entry: <code>logicsrc teams rotation</code> shows it.</p>` : ""
    ].join("");
    return `<tr>
      ${selectable ? `<td><input type="checkbox" name="keys" value="${esc(p.key)}" aria-label="Rotate ${esc(p.key)}"${p.never ? " disabled" : ""}></td>` : ""}
      <td><details><summary><code>${esc(p.key)}</code></summary><div style="font-size:.84rem;padding:6px 0">${details}</div></details></td>
      <td class="mono" style="font-size:.78rem">${esc(how)}</td>
      <td>${pill}</td>
      <td class="mono" style="font-size:.78rem">${esc(p.owner ?? "")}</td>
      <td>${p.vaultCount}</td>
      <td class="mono" style="font-size:.76rem;white-space:nowrap">${esc(String(p.lastRotated).slice(0, 10))}${p.ageDays !== null ? `<div class="faint">${p.ageDays}d${p.due ? ` <span class="pill warn">due</span>` : ""}</div>` : ""}</td>
    </tr>`;
  };
  return `<div class="table-scroll"><table><thead><tr>${selectable ? "<th></th>" : ""}<th>Key</th><th>Method</th><th></th><th>Owner</th><th>Vaults</th><th>Last rotated</th></tr></thead><tbody>${plan.map(row).join("")}</tbody></table></div>`;
}

function runsTable(runs, csrf, slug, approver) {
  if (!runs.length) return `<p class="faint mono" style="font-size:.82rem">No runs yet.</p>`;
  return `<div class="table-scroll"><table><thead><tr><th>Queued (UTC)</th><th>Keys</th><th>Mode</th><th>Status</th><th>Outcome</th><th></th></tr></thead><tbody>${runs.map((r) => `<tr>
    <td class="mono" style="font-size:.76rem;white-space:nowrap">${esc(when(r.createdAt))}<div class="faint">${esc(r.requestedBy ?? "")}</div></td>
    <td class="mono" style="font-size:.76rem">${r.keys.slice(0, 6).map(esc).join(", ")}${r.keys.length > 6 ? ` +${r.keys.length - 6}` : ""}</td>
    <td class="mono" style="font-size:.76rem">${r.approve ? "approved" : "dry run"}${r.options.desktop ? `, desktop ${esc(r.options.desktop)}` : ""}${r.options.propagate ? ", propagate" : ""}${r.options.allowRoll ? ", allow-roll" : ""}</td>
    <td><span class="pill ${r.status === "done" ? "on" : r.status === "failed" || r.status === "awaiting-approval" ? "warn" : ""}">${esc(r.status)}</span>${r.due ? `<div class="faint" style="font-size:.72rem">${esc(String(r.options.maxAgeDays ?? 90))}-day policy</div>` : ""}${r.approvedBy ? `<div class="faint" style="font-size:.72rem">approved by ${esc(r.approvedBy)}</div>` : ""}</td>
    <td style="font-size:.8rem">${esc(r.summary ?? "")}${r.results?.length ? `<details><summary class="faint">per key</summary><ul>${r.results.map((x) => `<li><code>${esc(x.key)}</code> ${esc(x.status)}${x.error ? `: ${esc(x.error)}` : x.note ? `: ${esc(x.note)}` : ""}</li>`).join("")}</ul></details>` : ""}</td>
    <td>${r.status === "awaiting-approval" && approver ? `<form method="post" action="/teams/${esc(slug)}/rotation/runs/${esc(r.id)}/approve" style="margin:0 0 4px">${csrf}<button class="btn acid compact">Approve</button></form>` : ""}${r.status === "queued" || r.status === "awaiting-approval" ? `<form method="post" action="/teams/${esc(slug)}/rotation/runs/${esc(r.id)}/cancel" style="margin:0">${csrf}<button class="btn compact">${r.status === "awaiting-approval" ? "Decline" : "Cancel"}</button></form>` : ""}</td>
  </tr>`).join("")}</tbody></table></div>`;
}

rotationRouter.get("/teams/:slug/rotation", requireAuth, async (req, res, next) => {
  const ctx = await pageContext(req);
  if (!ctx) return next();
  const project = req.query.project ? String(req.query.project) : undefined;
  const env = req.query.env ? String(req.query.env) : undefined;
  const maxAge = maxAgeDays(ctx.team);
  const autoApprove = Boolean(Number(ctx.team.rotation_auto_approve));
  const plan = await rotationPlan(ctx.team.id, { project, env, maxAge });
  const due = plan.filter((p) => p.due);
  const runs = await listRuns(ctx.team.id, { limit: 25 });
  const approver = canApprove(ctx.member);
  const slug = ctx.team.slug;
  const msg = { queued: "Rotation run queued. A runner picks it up with the command below.", cancelled: "Run cancelled.", approved: "Approved. The runner rotates it within a few minutes.", due: "Due keys queued as one run.", "none-due": `Nothing is older than ${maxAge} days.` }[String(req.query.ok || "")];
  const err = req.query.err ? String(req.query.err).slice(0, 200) : "";
  const auto = plan.filter((p) => p.automatic).length;
  const body = `${appBar(req)}
  <main class="wrap" style="max-width:980px;padding:26px 0 40px">
    <div class="section-title"><h1 style="font-size:1.6rem">Rotation <span class="faint">/${esc(slug)}</span></h1><span class="count">${plan.length}</span></div>
    ${msg ? `<div class="notice ok">${esc(msg)}</div>` : ""}${err ? `<div class="notice err">${esc(err)}</div>` : ""}
    <p class="dim" style="font-size:.9rem">How each secret in this team is rotated: ${auto} automatic, ${plan.length - auto} by hand or report-only. Values never reach this server, so a queued run is executed by the CLI or an agent:
      <code>logicsrc teams rotate-keys ${esc(slug)} --from-queue [--approve] [--propagate] [--desktop &lt;ssh-host&gt;]</code>. The runner's own <code>--approve</code> is needed for approved runs to write anything. Runbook: <a href="https://logicsrc.com/docs/rotation">logicsrc.com/docs/rotation</a>.</p>
    <div class="card" style="margin:12px 0"><div class="card-body" style="font-size:.88rem">
      <b>${maxAge}-day policy.</b> ${due.length ? `${due.length} automatic secret${due.length === 1 ? " is" : "s are"} older than ${maxAge} days${due.some((p) => p.disruptive) ? ` (${due.filter((p) => p.disruptive).length} of them: ${esc("rotating signs users out")})` : ""}.` : `Every automatic secret is younger than ${maxAge} days.`}
      ${autoApprove
        ? `Automatic rotation is on for this team: due keys rotate without a click.`
        : `Due keys are queued as one run that waits for an owner or admin to approve it; nothing rotates before that. <span class="faint">Automatic rotation without the approval step is a paid add-on.</span>`}
      ${due.length && approver ? `<form method="post" action="/teams/${esc(slug)}/rotation/due" style="margin:8px 0 0">${csrfInput(req)}<button class="btn compact">Queue the ${due.length} due key${due.length === 1 ? "" : "s"} now</button></form>` : ""}
    </div></div>
    <form method="get" style="display:flex;gap:8px;margin:10px 0"><input name="project" placeholder="project" value="${esc(project ?? "")}"><input name="env" placeholder="env" value="${esc(env ?? "")}"><button class="btn compact">Filter</button></form>
    <form method="post" action="/teams/${esc(slug)}/rotation/runs">${csrfInput(req)}
      ${project ? `<input type="hidden" name="project" value="${esc(project)}">` : ""}${env ? `<input type="hidden" name="env" value="${esc(env)}">` : ""}
      <div class="card"><div class="card-body">${planTable(plan, true)}
        <div style="display:flex;gap:14px;flex-wrap:wrap;align-items:center;margin-top:12px;font-size:.86rem">
          <label><input type="checkbox" name="approve" value="1"${approver ? "" : " disabled"}> approved (writes new values${approver ? "" : "; owner/admin only"})</label>
          <label><input type="checkbox" name="propagate" value="1"> propagate to consumer sites</label>
          <label>desktop host <input name="desktop" placeholder="bonita" style="width:110px"></label>
          <label><input type="checkbox" name="allowRoll" value="1"> allow roll (Cloudflare Global API Key: old key dies at once)</label>
          <button class="btn acid">Queue rotation run</button>
        </div></div></div>
    </form>
    <div class="label" style="margin:22px 0 6px">Runs</div>
    ${runsTable(runs, csrfInput(req), slug, approver)}
  </main>${footer}`;
  res.set("Cache-Control", "no-store");
  res.type("html").send(page({ title: `LogicSRC ▸ ${slug} rotation`, body }));
});

rotationRouter.post("/teams/:slug/rotation/runs", requireAuth, async (req, res, next) => {
  const ctx = await pageContext(req);
  if (!ctx) return next();
  const back = `/teams/${encodeURIComponent(ctx.team.slug)}/rotation`;
  try {
    await queueRun(ctx.team, ctx.member, req.user, req.body ?? {}, req);
    res.redirect(`${back}?ok=queued`);
  } catch (e) {
    if (e instanceof RotationRunError) return res.redirect(`${back}?err=${encodeURIComponent(e.message)}`);
    throw e;
  }
});

rotationRouter.post("/teams/:slug/rotation/runs/:id/cancel", requireAuth, async (req, res, next) => {
  const ctx = await pageContext(req);
  if (!ctx) return next();
  const back = `/teams/${encodeURIComponent(ctx.team.slug)}/rotation`;
  const r = await get(`SELECT * FROM credshare_rotation_runs WHERE id = ? AND team_id = ?`, [req.params.id, ctx.team.id]);
  if (!r || (r.requested_by !== req.user.id && !canApprove(ctx.member))) return res.redirect(`${back}?err=${encodeURIComponent("Not allowed.")}`);
  await run(`UPDATE credshare_rotation_runs SET status = 'cancelled', finished_at = ? WHERE id = ? AND status IN ('queued', 'awaiting-approval')`, [Date.now(), r.id]);
  res.redirect(`${back}?ok=cancelled`);
});

rotationRouter.post("/teams/:slug/rotation/runs/:id/approve", requireAuth, async (req, res, next) => {
  const ctx = await pageContext(req);
  if (!ctx) return next();
  const back = `/teams/${encodeURIComponent(ctx.team.slug)}/rotation`;
  try {
    await approveRun(ctx.team, ctx.member, req.user, req.params.id, req);
    res.redirect(`${back}?ok=approved`);
  } catch (e) {
    if (e instanceof RotationRunError) return res.redirect(`${back}?err=${encodeURIComponent(e.message)}`);
    throw e;
  }
});

rotationRouter.post("/teams/:slug/rotation/due", requireAuth, async (req, res, next) => {
  const ctx = await pageContext(req);
  if (!ctx) return next();
  const back = `/teams/${encodeURIComponent(ctx.team.slug)}/rotation`;
  if (!canApprove(ctx.member)) return res.redirect(`${back}?err=${encodeURIComponent("Only a team owner or admin can queue the due rotations.")}`);
  const out = await queueDueRun(ctx.team, req.user, req);
  res.redirect(`${back}?ok=${out.run ? "due" : "none-due"}`);
});
