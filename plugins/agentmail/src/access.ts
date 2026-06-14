// Access control for AgentMail. Mail is a Founding Lifetime Member (paid) perk,
// so every service call is gated on a paid identity. Capability constants keep
// route/manifest wiring and runtime checks in sync.

export const AGENTMAIL_CAPABILITIES = {
  mailboxList: "mailbox.list",
  messageList: "message.list",
  messageRead: "message.read",
  messageSearch: "message.search",
  messageCompose: "message.compose",
  messageSend: "message.send",
  messageFlag: "message.flag",
  messageDelete: "message.delete",
  accessGate: "access.gate"
} as const;

export type AgentMailCapability = (typeof AGENTMAIL_CAPABILITIES)[keyof typeof AGENTMAIL_CAPABILITIES];

/** Who is acting: a BBS member name and whether they hold the paid membership. */
export interface MailIdentity {
  /** The member's local-part / handle, e.g. "alice". */
  name: string;
  /** True for a Founding Lifetime Member; mail is gated on this. */
  paid: boolean;
}

/** Raised when a non-paid (or missing) identity attempts a mail action. */
export class MailAccessError extends Error {
  constructor(message = "AgentMail is a Founding Lifetime Member feature ($99 one-time) — upgrade: ssh join@bbs.profullstack.com") {
    super(message);
    this.name = "MailAccessError";
  }
}

/** Throws MailAccessError unless the identity is a paid member. */
export function assertPaid(identity: MailIdentity): void {
  if (!identity || !identity.name || !identity.paid) {
    throw new MailAccessError();
  }
}
