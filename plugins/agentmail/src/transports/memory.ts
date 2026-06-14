// InMemoryMailTransport is a complete, dependency-free MailTransport used by
// tests, local development, and as the reference for what a real backend must
// do. Sending appends to "Sent"; UIDs are assigned per process.

import { type Draft, type Mailbox, type Message, type MessageSummary, snippet } from "../domain.js";
import type { FlagChange, ListMessagesInput, MailTransport, SearchInput, SendResult } from "../ports.js";

function toSummary(m: Message): MessageSummary {
  return {
    uid: m.uid,
    mailbox: m.mailbox,
    from: m.from,
    to: m.to,
    subject: m.subject,
    date: m.date,
    seen: m.seen,
    flagged: m.flagged,
    hasAttachments: m.attachments.length > 0,
    snippet: m.snippet
  };
}

export interface SeedMessage extends Partial<Message> {
  mailbox: string;
  from: Message["from"];
  subject: string;
  text: string;
}

export class InMemoryMailTransport implements MailTransport {
  private readonly byMailbox = new Map<string, Message[]>();
  private nextUid = 1;

  constructor(seed: SeedMessage[] = []) {
    for (const s of seed) this.add(s);
  }

  /** Insert a message, filling in defaults; returns the stored copy. */
  add(seed: SeedMessage): Message {
    const text = seed.text ?? "";
    const message: Message = {
      uid: seed.uid ?? this.nextUid++,
      mailbox: seed.mailbox,
      from: seed.from,
      to: seed.to ?? [],
      cc: seed.cc ?? [],
      replyTo: seed.replyTo,
      subject: seed.subject,
      date: seed.date ?? new Date().toISOString(),
      seen: seed.seen ?? false,
      flagged: seed.flagged ?? false,
      hasAttachments: (seed.attachments ?? []).length > 0,
      snippet: seed.snippet ?? snippet(text),
      messageId: seed.messageId ?? `<${cryptoRandom()}@memory.local>`,
      references: seed.references ?? [],
      text,
      html: seed.html,
      attachments: seed.attachments ?? []
    };
    if (message.uid >= this.nextUid) this.nextUid = message.uid + 1;
    const list = this.byMailbox.get(message.mailbox) ?? [];
    list.push(message);
    this.byMailbox.set(message.mailbox, list);
    return message;
  }

  async listMailboxes(): Promise<Mailbox[]> {
    return [...this.byMailbox.entries()].map(([path, list]) => ({
      name: path,
      path,
      total: list.length,
      unseen: list.filter((m) => !m.seen).length
    }));
  }

  async listMessages(input: ListMessagesInput): Promise<MessageSummary[]> {
    const list = [...(this.byMailbox.get(input.mailbox) ?? [])];
    list.sort((a, b) => b.date.localeCompare(a.date));
    const limited = input.limit ? list.slice(0, input.limit) : list;
    return limited.map(toSummary);
  }

  async readMessage(mailbox: string, uid: number): Promise<Message | null> {
    const found = (this.byMailbox.get(mailbox) ?? []).find((m) => m.uid === uid);
    return found ? { ...found } : null;
  }

  async search(input: SearchInput): Promise<MessageSummary[]> {
    const q = input.query.toLowerCase();
    const mailboxes = input.mailbox ? [input.mailbox] : [...this.byMailbox.keys()];
    const hits: Message[] = [];
    for (const mb of mailboxes) {
      for (const m of this.byMailbox.get(mb) ?? []) {
        const haystack = `${m.subject} ${m.from.address} ${m.from.name ?? ""} ${m.text}`.toLowerCase();
        if (haystack.includes(q)) hits.push(m);
      }
    }
    hits.sort((a, b) => b.date.localeCompare(a.date));
    const limited = input.limit ? hits.slice(0, input.limit) : hits;
    return limited.map(toSummary);
  }

  async send(from: string, draft: Draft): Promise<SendResult> {
    const messageId = `<${cryptoRandom()}@${from.split("@")[1] ?? "memory.local"}>`;
    this.add({
      mailbox: "Sent",
      from: { address: from },
      to: draft.to,
      cc: draft.cc,
      subject: draft.subject,
      text: draft.text,
      html: draft.html,
      seen: true,
      messageId,
      references: draft.inReplyTo ? [draft.inReplyTo] : []
    });
    return { messageId };
  }

  async setFlags(mailbox: string, uid: number, flags: FlagChange): Promise<void> {
    const m = (this.byMailbox.get(mailbox) ?? []).find((x) => x.uid === uid);
    if (!m) return;
    if (flags.seen !== undefined) m.seen = flags.seen;
    if (flags.flagged !== undefined) m.flagged = flags.flagged;
  }

  async deleteMessage(mailbox: string, uid: number): Promise<void> {
    const list = this.byMailbox.get(mailbox);
    if (!list) return;
    this.byMailbox.set(
      mailbox,
      list.filter((m) => m.uid !== uid)
    );
  }
}

function cryptoRandom(): string {
  return Math.random().toString(36).slice(2, 12);
}
