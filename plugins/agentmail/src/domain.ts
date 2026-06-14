// Domain types and pure helpers for AgentMail. Everything here is
// transport-agnostic and JSON-serializable, so the same shapes serve a human
// TUI, a bot/agent over MCP or the CLI, and tests — no IMAP/SMTP knowledge.

/** A parsed mail address, e.g. { name: "Ada", address: "ada@mail.profullstack.com" }. */
export interface MailAddress {
  name?: string;
  address: string;
}

/** An IMAP-style mailbox (folder) with unread/total counts. */
export interface Mailbox {
  /** Display name, e.g. "INBOX". */
  name: string;
  /** Full path used by the transport, e.g. "INBOX" or "Archive/2026". */
  path: string;
  unseen: number;
  total: number;
}

/** A lightweight message row for list/search views. */
export interface MessageSummary {
  uid: number;
  mailbox: string;
  from: MailAddress;
  to: MailAddress[];
  subject: string;
  /** RFC3339/ISO date string. */
  date: string;
  seen: boolean;
  flagged: boolean;
  hasAttachments: boolean;
  /** A short plain-text preview of the body. */
  snippet: string;
}

/** Metadata for one attachment (bytes are fetched separately, not held here). */
export interface Attachment {
  filename: string;
  contentType: string;
  size: number;
}

/** A fully fetched message. */
export interface Message extends MessageSummary {
  cc: MailAddress[];
  replyTo?: MailAddress;
  messageId: string;
  references: string[];
  text: string;
  html?: string;
  attachments: Attachment[];
}

/** An outgoing message to compose and send. */
export interface Draft {
  to: MailAddress[];
  cc?: MailAddress[];
  bcc?: MailAddress[];
  subject: string;
  text: string;
  html?: string;
  /** Message-ID being replied to, for threading. */
  inReplyTo?: string;
}

/** Loose RFC5322-ish address check — one @, a dotted domain, no spaces. */
export function isValidEmail(value: string): boolean {
  const v = value.trim();
  if (v.length < 3 || v.length > 254 || /\s/.test(v)) return false;
  const at = v.lastIndexOf("@");
  if (at <= 0 || at === v.length - 1) return false;
  return v.slice(at + 1).includes(".");
}

/** The member's own address on the mail domain, e.g. alice@mail.profullstack.com. */
export function mailboxAddress(localPart: string, domain: string): string {
  return `${localPart}@${domain}`;
}

/** Parse "Name <addr@host>" or a bare "addr@host" into a MailAddress. */
export function parseAddress(raw: string): MailAddress {
  const s = raw.trim();
  const m = /^(.*)<([^>]+)>\s*$/.exec(s);
  if (m) {
    const name = m[1].trim().replace(/^"|"$/g, "").trim();
    const address = m[2].trim();
    return name ? { name, address } : { address };
  }
  return { address: s.replace(/^<|>$/g, "") };
}

/** Render a MailAddress back to "Name <addr>" (or just the address). */
export function formatAddress(addr: MailAddress): string {
  if (!addr.name) return addr.address;
  const needsQuotes = /[",<>@]/.test(addr.name);
  const name = needsQuotes ? `"${addr.name.replace(/"/g, '\\"')}"` : addr.name;
  return `${name} <${addr.address}>`;
}

/** Collapse a body to a single-line preview of at most `max` characters. */
export function snippet(body: string, max = 140): string {
  const flat = body.replace(/\s+/g, " ").trim();
  return flat.length <= max ? flat : `${flat.slice(0, max - 1)}…`;
}

/**
 * normalizeDraft validates and tidies a draft before it is handed to a
 * transport: it trims the subject, drops empty recipient lists, and rejects
 * a draft with no valid recipient. Throws DraftError on invalid input.
 */
export function normalizeDraft(draft: Draft): Draft {
  const clean = (list?: MailAddress[]) =>
    (list ?? []).map((a) => ({ ...a, address: a.address.trim() })).filter((a) => a.address.length > 0);

  const to = clean(draft.to);
  const cc = clean(draft.cc);
  const bcc = clean(draft.bcc);

  const recipients = [...to, ...cc, ...bcc];
  if (recipients.length === 0) throw new DraftError("a draft needs at least one recipient");
  const bad = recipients.find((a) => !isValidEmail(a.address));
  if (bad) throw new DraftError(`invalid recipient address: ${bad.address}`);

  const normalized: Draft = {
    to,
    subject: (draft.subject ?? "").trim(),
    text: draft.text ?? ""
  };
  if (cc.length) normalized.cc = cc;
  if (bcc.length) normalized.bcc = bcc;
  if (draft.html !== undefined) normalized.html = draft.html;
  if (draft.inReplyTo !== undefined) normalized.inReplyTo = draft.inReplyTo;
  return normalized;
}

/** Thrown when a draft is malformed (no/invalid recipients, etc.). */
export class DraftError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "DraftError";
  }
}
