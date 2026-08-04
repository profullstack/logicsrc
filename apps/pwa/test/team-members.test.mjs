// Integration coverage for team-member CRUD, invite-key rotation, and the
// dashboard controls that expose those operations.
process.env.DATABASE_URL = ":memory:";

import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import express from "express";

const here = dirname(fileURLToPath(import.meta.url));
const { db, run, get } = await import("../src/db.mjs");
const { sha256 } = await import("../src/lib/crypto.mjs");
const { credshareRouter } = await import("../src/routes/credshare.mjs");
const { pagesRouter } = await import("../src/routes/pages.mjs");

for (const file of ["001_auth.sql", "002_credshare.sql"]) {
  const sql = readFileSync(join(here, "..", "src", "migrations", file), "utf8");
  for (const statement of sql.split(/;\s*$/m).map((s) => s.trim()).filter(Boolean)) await db.execute(statement);
}

const now = Date.now();
for (const [id, email] of [
  ["u_owner", "owner@example.com"],
  ["u_owner2", "owner2@example.com"],
  ["u_admin", "admin@example.com"],
  ["u_member", "member@example.com"]
]) await run(`INSERT INTO users (id, email, created_at) VALUES (?,?,?)`, [id, email, now]);

async function seedTeam(id, slug, members) {
  await run(`INSERT INTO credshare_teams (id, slug, name, created_by, created_at) VALUES (?,?,?,?,?)`, [id, slug, slug, "u_owner", now]);
  for (const member of members) {
    await run(`INSERT INTO credshare_members (id, team_id, user_id, email, role, status, created_at) VALUES (?,?,?,?,?,?,?)`,
      [member.id, id, member.userId ?? null, member.email, member.role, member.status, now]);
  }
}

await seedTeam("t_rotate", "rotate", [
  { id: "rotate_owner", userId: "u_owner", email: "owner@example.com", role: "owner", status: "active" },
  { id: "rotate_invited", email: "new@example.com", role: "member", status: "invited" }
]);
await run(`INSERT INTO credshare_invites (id, team_id, email, role, token_hash, created_by, expires_at, created_at) VALUES (?,?,?,?,?,?,?,?)`,
  ["old_invite", "t_rotate", "new@example.com", "member", sha256("old-key"), "u_owner", now + 864e5, now]);

await seedTeam("t_manage", "manage", [
  { id: "manage_owner", userId: "u_owner", email: "owner@example.com", role: "owner", status: "active" },
  { id: "manage_admin", userId: "u_admin", email: "admin@example.com", role: "admin", status: "active" },
  { id: "manage_member", userId: "u_member", email: "member@example.com", role: "member", status: "active" },
  { id: "manage_member2", email: "member2@example.com", role: "member", status: "invited" },
  { id: "manage_invited_admin", email: "future-admin@example.com", role: "admin", status: "invited" }
]);
await run(`INSERT INTO credshare_vaults (id, team_id, name, created_by, created_at) VALUES (?,?,?,?,?)`, ["v_manage", "t_manage", "app--prod", "u_owner", now]);
await run(`INSERT INTO credshare_vault_grants (vault_id, user_id, wrapped_dek, granted_by, created_at) VALUES (?,?,?,?,?)`, ["v_manage", "u_member", "wrapped", "u_owner", now]);

await seedTeam("t_owners", "owners", [
  { id: "owners_owner", userId: "u_owner", email: "owner@example.com", role: "owner", status: "active" },
  { id: "owners_owner2", userId: "u_owner2", email: "owner2@example.com", role: "owner", status: "active" }
]);

async function serve(actingUserId) {
  const user = await get(`SELECT * FROM users WHERE id = ?`, [actingUserId]);
  const app = express();
  app.use(express.json());
  app.use(express.urlencoded({ extended: false }));
  app.use((req, _res, next) => {
    req.user = user;
    req.csrfToken = "test-csrf";
    next();
  });
  app.use(credshareRouter);
  app.use(pagesRouter);
  const server = app.listen(0);
  await new Promise((resolve) => server.once("listening", resolve));
  const base = `http://127.0.0.1:${server.address().port}`;
  return {
    async request(method, path, body) {
      const response = await fetch(`${base}${path}`, {
        method,
        headers: body === undefined ? undefined : { "content-type": "application/json" },
        body: body === undefined ? undefined : JSON.stringify(body),
        redirect: "manual"
      });
      const text = await response.text();
      return { status: response.status, body: response.headers.get("content-type")?.includes("json") ? JSON.parse(text) : text, location: response.headers.get("location") };
    },
    close: () => new Promise((resolve) => server.close(resolve))
  };
}

test("resending rotates the invite key and updates its requested permission", async (t) => {
  const app = await serve("u_owner");
  t.after(() => app.close());

  const response = await app.request("POST", "/api/credshare/teams/rotate/invites", { email: "new@example.com", role: "admin" });
  assert.equal(response.status, 201);
  assert.equal(response.body.resent, true);
  assert.equal(response.body.invite.role, "admin");
  assert.ok(response.body.token);

  assert.equal(await get(`SELECT 1 AS hit FROM credshare_invites WHERE token_hash = ?`, [sha256("old-key")]), null);
  assert.equal((await get(`SELECT COUNT(*) AS n FROM credshare_invites WHERE team_id = 't_rotate' AND email = 'new@example.com' AND accepted_at IS NULL`)).n, 1);
  assert.equal((await get(`SELECT role FROM credshare_members WHERE id = 'rotate_invited'`)).role, "admin");

  const oldAccept = await app.request("POST", "/api/credshare/invites/accept", { token: "old-key" });
  assert.equal(oldAccept.status, 404);
});

test("owners can change permissions but the final active owner cannot be demoted", async (t) => {
  const app = await serve("u_owner");
  t.after(() => app.close());

  const promoted = await app.request("PATCH", "/api/credshare/teams/manage/members/manage_member", { role: "admin" });
  assert.equal(promoted.status, 200);
  assert.equal(promoted.body.member.role, "admin");

  const lastOwner = await app.request("PATCH", "/api/credshare/teams/manage/members/manage_owner", { role: "admin" });
  assert.equal(lastOwner.status, 409);
  assert.equal(lastOwner.body.code, "last-owner");

  const transferable = await app.request("PATCH", "/api/credshare/teams/owners/members/owners_owner", { role: "member" });
  assert.equal(transferable.status, 200);
});

test("admins cannot promote members or manage owners", async (t) => {
  const app = await serve("u_admin");
  t.after(() => app.close());

  const promote = await app.request("PATCH", "/api/credshare/teams/manage/members/manage_member", { role: "admin" });
  assert.equal(promote.status, 403);
  const removeOwner = await app.request("DELETE", "/api/credshare/teams/manage/members/manage_owner");
  assert.equal(removeOwner.status, 403);
  const removeMember = await app.request("DELETE", "/api/credshare/teams/manage/members/manage_member2");
  assert.equal(removeMember.status, 200);

  const replaceAdminInvite = await app.request("POST", "/api/credshare/teams/manage/invites", { email: "future-admin@example.com", role: "member" });
  assert.equal(replaceAdminInvite.status, 403);
});

test("removing a member also removes their vault grants", async (t) => {
  // The previous role test promoted manage_member, so the owner performs this
  // removal; an admin must not be able to remove a peer admin.
  const app = await serve("u_owner");
  t.after(() => app.close());

  const response = await app.request("DELETE", "/api/credshare/teams/manage/members/manage_member");
  assert.equal(response.status, 200);
  assert.equal(response.body.revokedVaultGrants, 1);
  assert.equal(response.body.rotationRequired, true);
  assert.equal(await get(`SELECT 1 AS hit FROM credshare_members WHERE id = 'manage_member'`), null);
  assert.equal(await get(`SELECT 1 AS hit FROM credshare_vault_grants WHERE vault_id = 'v_manage' AND user_id = 'u_member'`), null);

  const readded = await app.request("POST", "/api/credshare/teams/manage/invites", { email: "member@example.com", role: "member" });
  assert.equal(readded.status, 201);
  assert.equal(readded.body.resent, false);
  assert.equal((await get(`SELECT status FROM credshare_members WHERE team_id = 't_manage' AND email = 'member@example.com'`)).status, "invited");
  assert.equal(await get(`SELECT 1 AS hit FROM credshare_vault_grants WHERE vault_id = 'v_manage' AND user_id = 'u_member'`), null);
});

test("dashboard renders permission, resend, and remove controls", async (t) => {
  const app = await serve("u_owner");
  t.after(() => app.close());

  const response = await app.request("GET", "/dashboard");
  assert.equal(response.status, 200);
  assert.match(response.body, /aria-label="Permission for new@example\.com"/);
  assert.match(response.body, />Resend<\/button>/);
  assert.match(response.body, />Remove<\/button>/);
  assert.match(response.body, /<select name="role" aria-label="Permission"/);
});
