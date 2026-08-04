import { get, batch } from "../db.mjs";
import { id, token, sha256 } from "./crypto.mjs";
import { config } from "../config.mjs";

export const TEAM_ROLES = ["owner", "admin", "member"];
export const ROLE_RANK = { member: 0, admin: 1, owner: 2 };
export const INVITE_TTL = 1000 * 60 * 60 * 24 * 7;
export const normEmail = (email) => String(email || "").trim().toLowerCase();

export class TeamMemberError extends Error {
  constructor(status, message, code = "member-error") {
    super(message);
    this.name = "TeamMemberError";
    this.status = status;
    this.code = code;
  }
}

export function canManageMember(actor, target) {
  if (!actor || actor.status !== "active") return false;
  if (actor.role === "owner") return true;
  return actor.role === "admin" && target.role === "member";
}

function assertInviteRole(actor, role) {
  if (!TEAM_ROLES.includes(role)) {
    throw new TeamMemberError(422, "Role must be owner, admin, or member.", "bad-role");
  }
  if (actor.role !== "owner" && !(actor.role === "admin" && role === "member")) {
    throw new TeamMemberError(403, "Only owners can invite admins or owners.", "not-allowed");
  }
}

async function sendInviteEmail(to, tok, team, fromEmail) {
  if (!config.resend.apiKey) return false;
  const url = `${config.origin}/teams/accept?token=${encodeURIComponent(tok)}`;
  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { authorization: `Bearer ${config.resend.apiKey}`, "content-type": "application/json" },
    body: JSON.stringify({
      from: config.resend.from,
      to,
      subject: `You're invited to the "${team.name}" credential team on LogicSRC`,
      text: `${fromEmail} invited you to share credentials on ${team.name} (${team.slug}).\n\nAccept in the CLI:\n  logicsrc login\n  logicsrc teams accept ${tok}\n\nOr on the web: ${url}\n\nSecrets are end-to-end encrypted — the server never sees them.`
    })
  }).catch(() => null);
  return Boolean(response && response.ok);
}

// Create or resend an invite. A resend replaces every unused invite for this
// team/email pair so the old key stops working immediately.
export async function issueTeamInvite({ team, actor, email: rawEmail, role: rawRole }) {
  if (!actor || actor.status !== "active" || ROLE_RANK[actor.role] < ROLE_RANK.admin) {
    throw new TeamMemberError(403, "Only owners and admins can invite.", "not-allowed");
  }
  const email = normEmail(rawEmail);
  if (!email) throw new TeamMemberError(422, "Expected an email address.", "bad-email");
  const role = String(rawRole || "member");
  assertInviteRole(actor, role);

  const existing = await get(`SELECT * FROM credshare_members WHERE team_id = ? AND email = ?`, [team.id, email]);
  if (existing?.status === "active") {
    throw new TeamMemberError(409, `${email} is already an active team member.`, "already-member");
  }
  if (existing && actor.role === "admin" && existing.role !== "member") {
    throw new TeamMemberError(403, "Admins cannot replace an owner or admin invite.", "not-allowed");
  }

  const invitedUser = await get(`SELECT id FROM users WHERE email = ?`, [email]);
  const tok = token(24);
  const now = Date.now();
  const inviteId = id();
  const statements = [];
  if (existing) {
    statements.push({
      sql: `UPDATE credshare_members SET user_id = COALESCE(user_id, ?), role = ?, invited_by = ? WHERE id = ?`,
      args: [invitedUser?.id ?? null, role, actor.user_id, existing.id]
    });
  } else {
    statements.push({
      sql: `INSERT INTO credshare_members (id, team_id, user_id, email, role, status, invited_by, created_at) VALUES (?,?,?,?,?,?,?,?)`,
      args: [id(), team.id, invitedUser?.id ?? null, email, role, "invited", actor.user_id, now]
    });
  }
  statements.push(
    {
      sql: `DELETE FROM credshare_invites WHERE team_id = ? AND email = ? AND accepted_at IS NULL`,
      args: [team.id, email]
    },
    {
      sql: `INSERT INTO credshare_invites (id, team_id, email, role, token_hash, created_by, expires_at, created_at) VALUES (?,?,?,?,?,?,?,?)`,
      args: [inviteId, team.id, email, role, sha256(tok), actor.user_id, now + INVITE_TTL, now]
    },
    {
      sql: `INSERT INTO credshare_audit (id, team_id, vault_id, actor_user_id, action, key_name, fingerprint, created_at) VALUES (?,?,?,?,?,?,?,?)`,
      args: [id(), team.id, null, actor.user_id, existing ? "team:invite:resend" : "team:invite", email, null, now]
    }
  );
  await batch(statements);

  const emailSent = await sendInviteEmail(email, tok, team, actor.email);
  return {
    invite: { id: inviteId, email, role, expiresAt: now + INVITE_TTL },
    emailSent,
    token: tok,
    resent: Boolean(existing)
  };
}

export async function changeMemberRole({ team, actor, memberId, role }) {
  if (!actor || actor.status !== "active" || actor.role !== "owner") {
    throw new TeamMemberError(403, "Only owners can change member permissions.", "not-allowed");
  }
  if (!TEAM_ROLES.includes(role)) {
    throw new TeamMemberError(422, "Role must be owner, admin, or member.", "bad-role");
  }
  const target = await get(`SELECT * FROM credshare_members WHERE id = ? AND team_id = ?`, [memberId, team.id]);
  if (!target) throw new TeamMemberError(404, "Team member not found.", "member-not-found");
  if (target.role === role) return target;

  if (target.role === "owner" && target.status === "active" && role !== "owner") {
    const owners = await get(`SELECT COUNT(*) AS n FROM credshare_members WHERE team_id = ? AND role = 'owner' AND status = 'active'`, [team.id]);
    if (Number(owners?.n || 0) <= 1) {
      throw new TeamMemberError(409, "A team must keep at least one active owner.", "last-owner");
    }
  }

  const now = Date.now();
  await batch([
    { sql: `UPDATE credshare_members SET role = ? WHERE id = ?`, args: [role, target.id] },
    { sql: `UPDATE credshare_invites SET role = ? WHERE team_id = ? AND email = ? AND accepted_at IS NULL`, args: [role, team.id, target.email] },
    {
      sql: `INSERT INTO credshare_audit (id, team_id, vault_id, actor_user_id, action, key_name, fingerprint, created_at) VALUES (?,?,?,?,?,?,?,?)`,
      args: [id(), team.id, null, actor.user_id, `team:member:role:${target.role}->${role}`, target.email, null, now]
    }
  ]);
  return { ...target, role };
}

export async function removeTeamMember({ team, actor, memberId }) {
  const target = await get(`SELECT * FROM credshare_members WHERE id = ? AND team_id = ?`, [memberId, team.id]);
  if (!target) throw new TeamMemberError(404, "Team member not found.", "member-not-found");
  if (!canManageMember(actor, target)) {
    throw new TeamMemberError(403, "You cannot remove this team member.", "not-allowed");
  }

  if (target.role === "owner" && target.status === "active") {
    const owners = await get(`SELECT COUNT(*) AS n FROM credshare_members WHERE team_id = ? AND role = 'owner' AND status = 'active'`, [team.id]);
    if (Number(owners?.n || 0) <= 1) {
      throw new TeamMemberError(409, "A team must keep at least one active owner.", "last-owner");
    }
  }

  const grantCount = target.user_id
    ? await get(`SELECT COUNT(*) AS n FROM credshare_vault_grants WHERE user_id = ? AND vault_id IN (SELECT id FROM credshare_vaults WHERE team_id = ?)`, [target.user_id, team.id])
    : null;
  const revokedVaultGrants = Number(grantCount?.n || 0);
  const now = Date.now();
  await batch([
    {
      sql: `DELETE FROM credshare_vault_grants WHERE user_id = ? AND vault_id IN (SELECT id FROM credshare_vaults WHERE team_id = ?)`,
      args: [target.user_id || "", team.id]
    },
    { sql: `DELETE FROM credshare_invites WHERE team_id = ? AND email = ? AND accepted_at IS NULL`, args: [team.id, target.email] },
    { sql: `DELETE FROM credshare_members WHERE id = ?`, args: [target.id] },
    {
      sql: `INSERT INTO credshare_audit (id, team_id, vault_id, actor_user_id, action, key_name, fingerprint, created_at) VALUES (?,?,?,?,?,?,?,?)`,
      args: [id(), team.id, null, actor.user_id, "team:member:remove", target.email, null, now]
    }
  ]);
  return { member: target, revokedVaultGrants, rotationRequired: revokedVaultGrants > 0 };
}
