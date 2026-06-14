// Mailu transport: the seam to the self-hosted mail stack (Postfix + Dovecot)
// at mail.profullstack.com. To keep heavy network libs out of the plugin (the
// repo convention — cf. agentgit injecting its forge adapter), the actual
// IMAP/SMTP drivers are injected. A consuming app wires concrete drivers
// (e.g. imapflow + nodemailer in Node, or the Go client on the BBS); this
// module owns config resolution and presents them as one MailTransport.

import type { Draft, Mailbox, Message, MessageSummary } from "../domain.js";
import { MailTransportError, type FlagChange, type ListMessagesInput, type MailTransport, type SearchInput, type SendResult } from "../ports.js";

export interface MailuConfig {
  /** Mail domain for member addresses, e.g. "mail.profullstack.com". */
  domain: string;
  imap: { host: string; port: number; secure: boolean };
  smtp: { host: string; port: number; secure: boolean };
  /** Per-member IMAP/SMTP credentials (Dovecot/Postfix auth). */
  auth: { user: string; pass: string };
}

/** Low-level IMAP operations a driver must implement (returns domain types). */
export interface ImapDriver {
  listMailboxes(): Promise<Mailbox[]>;
  listMessages(input: ListMessagesInput): Promise<MessageSummary[]>;
  readMessage(mailbox: string, uid: number): Promise<Message | null>;
  search(input: SearchInput): Promise<MessageSummary[]>;
  setFlags(mailbox: string, uid: number, flags: FlagChange): Promise<void>;
  deleteMessage(mailbox: string, uid: number): Promise<void>;
}

/** Low-level SMTP submission a driver must implement. */
export interface SmtpDriver {
  send(from: string, draft: Draft): Promise<SendResult>;
}

export interface CreateMailuTransportOptions {
  config: MailuConfig;
  imap: ImapDriver;
  smtp: SmtpDriver;
}

/**
 * resolveMailuConfig builds a MailuConfig from the environment, defaulting to
 * the production hosts (mail.profullstack.com over IMAPS:993, smtp.profullstack.com
 * over submission:587/STARTTLS). The caller supplies the member's credentials.
 */
export function resolveMailuConfig(auth: { user: string; pass: string }, env: Record<string, string | undefined> = process.env): MailuConfig {
  const domain = env.AGENTMAIL_DOMAIN ?? "mail.profullstack.com";
  return {
    domain,
    imap: {
      host: env.AGENTMAIL_IMAP_HOST ?? domain,
      port: Number(env.AGENTMAIL_IMAP_PORT ?? 993),
      secure: (env.AGENTMAIL_IMAP_SECURE ?? "true") !== "false"
    },
    smtp: {
      host: env.AGENTMAIL_SMTP_HOST ?? "smtp.profullstack.com",
      port: Number(env.AGENTMAIL_SMTP_PORT ?? 587),
      secure: (env.AGENTMAIL_SMTP_SECURE ?? "false") === "true"
    },
    auth
  };
}

/**
 * createMailuTransport wires injected IMAP/SMTP drivers into a MailTransport.
 * Drivers must be supplied; otherwise every call fails fast with a clear error
 * instead of silently doing nothing.
 */
export function createMailuTransport(opts: CreateMailuTransportOptions): MailTransport {
  const { config, imap, smtp } = opts;
  if (!imap || !smtp) {
    throw new MailTransportError("createMailuTransport requires both imap and smtp drivers");
  }
  return {
    listMailboxes: () => imap.listMailboxes(),
    listMessages: (input) => imap.listMessages(input),
    readMessage: (mailbox, uid) => imap.readMessage(mailbox, uid),
    search: (input) => imap.search(input),
    setFlags: (mailbox, uid, flags) => imap.setFlags(mailbox, uid, flags),
    deleteMessage: (mailbox, uid) => imap.deleteMessage(mailbox, uid),
    send: (from, draft) => {
      const expected = `@${config.domain}`;
      if (!from.endsWith(expected)) {
        throw new MailTransportError(`sender ${from} is not on the mail domain ${config.domain}`);
      }
      return smtp.send(from, draft);
    }
  };
}
