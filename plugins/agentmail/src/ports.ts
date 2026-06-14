// The transport seam. AgentMailService talks only to this interface, so the
// same service drives an in-memory fake (tests/dev), a real IMAP/SMTP backend
// (Mailu, see transports/mailu.ts), or any other provider. This mirrors how
// the agentgit plugin injects its forge adapter.

import type { Draft, Mailbox, Message, MessageSummary } from "./domain.js";

export interface ListMessagesInput {
  mailbox: string;
  /** Max rows to return (newest first). */
  limit?: number;
}

export interface SearchInput {
  /** Mailbox to search; omitted means all mailboxes. */
  mailbox?: string;
  /** Free-text query matched against subject, from, and body. */
  query: string;
  limit?: number;
}

export interface FlagChange {
  seen?: boolean;
  flagged?: boolean;
}

export interface SendResult {
  messageId: string;
}

/** The low-level mailbox operations a backend must provide. */
export interface MailTransport {
  listMailboxes(): Promise<Mailbox[]>;
  listMessages(input: ListMessagesInput): Promise<MessageSummary[]>;
  /** Returns null when the uid is unknown in that mailbox. */
  readMessage(mailbox: string, uid: number): Promise<Message | null>;
  search(input: SearchInput): Promise<MessageSummary[]>;
  /** Sends an already-normalized draft; the From header is stamped by the service. */
  send(from: string, draft: Draft): Promise<SendResult>;
  setFlags(mailbox: string, uid: number, flags: FlagChange): Promise<void>;
  deleteMessage(mailbox: string, uid: number): Promise<void>;
}

/** Raised by transports for connection/protocol failures. */
export class MailTransportError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "MailTransportError";
  }
}
