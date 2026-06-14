import type { MemberRole, Repo } from "./domain.js";

export type Action = "read" | "write" | "review" | "merge" | "admin";

export interface GateResult {
  allowed: boolean;
  role?: MemberRole;
  reason?: string;
}

const ROLE_ACTIONS: Record<MemberRole, Action[]> = {
  reader: ["read"],
  reviewer: ["read", "review"],
  contributor: ["read", "review", "write"],
  maintainer: ["read", "review", "write", "merge", "admin"]
};

function rolePermits(role: MemberRole, action: Action): boolean {
  return ROLE_ACTIONS[role].includes(action);
}

/**
 * The membership gate. Every AgentGit operation runs through this before any
 * backend call. The owner is an implicit maintainer; public repos allow `read`
 * to anyone; everything else requires a matching member role. There is no
 * anonymous access to members_only/private repos.
 */
export function gateAccess(repo: Repo, callerDid: string | undefined, action: Action): GateResult {
  if (callerDid && callerDid === repo.owner_did) {
    return { allowed: true, role: "maintainer" };
  }

  if (action === "read" && repo.visibility === "public") {
    return { allowed: true, role: "reader" };
  }

  if (!callerDid) {
    return { allowed: false, reason: "authentication required (DID)" };
  }

  const member = repo.members.find((entry) => entry.did === callerDid);
  if (!member) {
    return { allowed: false, reason: `${callerDid} is not a member of ${repo.slug}` };
  }

  if (!rolePermits(member.role, action)) {
    return { allowed: false, role: member.role, reason: `role "${member.role}" cannot ${action}` };
  }

  return { allowed: true, role: member.role };
}
