// AgentMailService is the single entry point a TUI, CLI, or agent uses. It is
// transport-agnostic (talks to a MailTransport), paid-gated (every call asserts
// a Founding Lifetime identity), and returns plain JSON-serializable domain
// objects so the same API is ergonomic for humans and bots alike.

import { assertPaid, type MailIdentity } from "./access.js";
import { type Draft, type Mailbox, type Message, type MessageSummary, mailboxAddress, normalizeDraft } from "./domain.js";
import type { FlagChange, MailTransport, SearchInput, SendResult } from "./ports.js";

export interface AgentMailServiceOptions {
  transport: MailTransport;
  identity: MailIdentity;
  /** Mail domain for the member's own address, e.g. "mail.profullstack.com". */
  domain: string;
  /** Default page size for inbox/list calls. */
  defaultLimit?: number;
}

const DEFAULT_LIMIT = 50;
const INBOX = "INBOX";

export class AgentMailService {
  private readonly transport: MailTransport;
  private readonly identity: MailIdentity;
  private readonly domain: string;
  private readonly defaultLimit: number;

  constructor(opts: AgentMailServiceOptions) {
    this.transport = opts.transport;
    this.identity = opts.identity;
    this.domain = opts.domain;
    this.defaultLimit = opts.defaultLimit ?? DEFAULT_LIMIT;
  }

  /** The member's own address, e.g. alice@mail.profullstack.com. */
  address(): string {
    return mailboxAddress(this.identity.name, this.domain);
  }

  /** List all mailboxes (folders) with unread/total counts. */
  async mailboxes(): Promise<Mailbox[]> {
    assertPaid(this.identity);
    return this.transport.listMailboxes();
  }

  /** Newest-first summaries for a mailbox (INBOX by default). */
  async list(mailbox = INBOX, limit?: number): Promise<MessageSummary[]> {
    assertPaid(this.identity);
    return this.transport.listMessages({ mailbox, limit: limit ?? this.defaultLimit });
  }

  /** Convenience for the INBOX. */
  async inbox(limit?: number): Promise<MessageSummary[]> {
    return this.list(INBOX, limit);
  }

  /** Fetch one full message; marks it seen unless { peek: true }. */
  async read(mailbox: string, uid: number, opts: { peek?: boolean } = {}): Promise<Message | null> {
    assertPaid(this.identity);
    const message = await this.transport.readMessage(mailbox, uid);
    if (message && !opts.peek && !message.seen) {
      await this.transport.setFlags(mailbox, uid, { seen: true });
      message.seen = true;
    }
    return message;
  }

  /** Free-text search across a mailbox (or all if omitted). */
  async search(query: string, opts: Omit<SearchInput, "query"> = {}): Promise<MessageSummary[]> {
    assertPaid(this.identity);
    return this.transport.search({ query, limit: this.defaultLimit, ...opts });
  }

  /** Validate, stamp From, and send a draft. Returns the new Message-ID. */
  async send(draft: Draft): Promise<SendResult> {
    assertPaid(this.identity);
    const normalized = normalizeDraft(draft);
    return this.transport.send(this.address(), normalized);
  }

  /**
   * Reply builds a draft addressed back to the original sender (and, when
   * replyAll, the other recipients minus the member) with a "Re:" subject and
   * In-Reply-To set for threading, then sends it.
   */
  async reply(original: Message, text: string, opts: { replyAll?: boolean; html?: string } = {}): Promise<SendResult> {
    assertPaid(this.identity);
    const self = this.address().toLowerCase();
    const to = [original.replyTo ?? original.from];
    const cc = opts.replyAll
      ? [...original.to, ...original.cc].filter((a) => a.address.toLowerCase() !== self && a.address.toLowerCase() !== to[0].address.toLowerCase())
      : undefined;
    const subject = /^re:/i.test(original.subject) ? original.subject : `Re: ${original.subject}`;
    return this.send({ to, cc, subject, text, html: opts.html, inReplyTo: original.messageId });
  }

  async markSeen(mailbox: string, uid: number, seen = true): Promise<void> {
    assertPaid(this.identity);
    return this.transport.setFlags(mailbox, uid, { seen });
  }

  async flag(mailbox: string, uid: number, flagged = true): Promise<void> {
    assertPaid(this.identity);
    return this.transport.setFlags(mailbox, uid, { flagged });
  }

  async setFlags(mailbox: string, uid: number, flags: FlagChange): Promise<void> {
    assertPaid(this.identity);
    return this.transport.setFlags(mailbox, uid, flags);
  }

  async delete(mailbox: string, uid: number): Promise<void> {
    assertPaid(this.identity);
    return this.transport.deleteMessage(mailbox, uid);
  }
}
