// AgentMail host wiring for the CommandBoard API. The @logicsrc/plugin-agentmail
// package deliberately ships no network libraries — it defines the service,
// domain types, and a Mailu transport that expects injected IMAP/SMTP drivers.
// This module supplies those drivers (imapflow + nodemailer + mailparser) and
// builds the AgentMailService from the environment, pointing at the existing
// agentbbs Mailu server (mail.profullstack.com). When mail isn't configured it
// falls back to the in-memory transport so the API still boots and is testable.
//
// Env:
//   AGENTMAIL_BACKEND     "mailu" to use the real server; anything else = memory
//   AGENTMAIL_MEMBER      acting member handle (local-part), e.g. "chovy"
//   AGENTMAIL_PAID        "false" to disable the paid gate (default paid=true)
//   AGENTMAIL_DOMAIN      member address domain (default bbs.profullstack.com)
//   AGENTMAIL_IMAP_HOST / _PORT / _SECURE
//   AGENTMAIL_SMTP_HOST / _PORT / _SECURE / _TLS_SERVERNAME
//   AGENTMAIL_USER / AGENTMAIL_PASS   IMAP/SMTP credentials for the mailbox
import { ImapFlow, type FetchMessageObject } from "imapflow";
import { simpleParser, type AddressObject } from "mailparser";
import nodemailer from "nodemailer";
import {
  AgentMailService,
  createMailuTransport,
  InMemoryMailTransport,
  resolveMailuConfig,
  snippet,
  type Draft,
  type ImapDriver,
  type MailAddress,
  type Mailbox,
  type MailIdentity,
  type MailTransport,
  type MailuConfig,
  type Message,
  type MessageSummary,
  type SmtpDriver
} from "@logicsrc/plugin-agentmail";

const DEFAULT_DOMAIN = "bbs.profullstack.com";

// Acting identity. For now a single configured service member (consistent with
// the chovy@bbs.profullstack.com + plus-addressing decision); per-member auth is
// a follow-up. A request may override the handle via the x-agentmail-member
// header without changing which mailbox credentials are used.
export function mailIdentity(memberHeader?: string | null): MailIdentity {
  const name = (memberHeader || process.env.AGENTMAIL_MEMBER || "chovy").trim();
  const paid = process.env.AGENTMAIL_PAID !== "false";
  return { name, paid };
}

// Builds the AgentMailService for a request. Uses the real Mailu transport when
// AGENTMAIL_BACKEND=mailu and credentials are present; otherwise an in-memory
// transport (dev/test) so routes are always exercisable.
export function buildAgentMailService(identity: MailIdentity): AgentMailService {
  const domain = process.env.AGENTMAIL_DOMAIN ?? DEFAULT_DOMAIN;
  const transport = resolveTransport();
  return new AgentMailService({ transport, identity, domain });
}

// A single in-memory transport shared across requests so the dev/test backend
// behaves like a real server (sent mail persists for later reads in-process).
let memoryTransport: InMemoryMailTransport | undefined;

function resolveTransport(): MailTransport {
  const user = process.env.AGENTMAIL_USER;
  const pass = process.env.AGENTMAIL_PASS;
  if (process.env.AGENTMAIL_BACKEND !== "mailu" || !user || !pass) {
    memoryTransport ??= new InMemoryMailTransport();
    return memoryTransport;
  }
  const config = resolveMailuConfig({ user, pass });
  return createMailuTransport({
    config,
    imap: createImapflowDriver(config),
    smtp: createNodemailerDriver(config)
  });
}

// --- IMAP driver (imapflow + mailparser) ---

function createImapflowDriver(config: MailuConfig): ImapDriver {
  const connect = () =>
    new ImapFlow({
      host: config.imap.host,
      port: config.imap.port,
      secure: config.imap.secure,
      auth: { user: config.auth.user, pass: config.auth.pass },
      logger: false
    });

  // Each call opens a short-lived connection so the host stays stateless.
  const withClient = async <T>(fn: (c: ImapFlow) => Promise<T>): Promise<T> => {
    const client = connect();
    await client.connect();
    try {
      return await fn(client);
    } finally {
      await client.logout().catch(() => {});
    }
  };

  return {
    async listMailboxes(): Promise<Mailbox[]> {
      return withClient(async (c) => {
        const out: Mailbox[] = [];
        for (const box of await c.list()) {
          const status = await c.status(box.path, { messages: true, unseen: true });
          out.push({
            name: box.name,
            path: box.path,
            unseen: status.unseen ?? 0,
            total: status.messages ?? 0
          });
        }
        return out;
      });
    },

    async listMessages({ mailbox, limit = 50 }): Promise<MessageSummary[]> {
      return withClient(async (c) => {
        const lock = await c.getMailboxLock(mailbox);
        try {
          const status = await c.status(mailbox, { messages: true });
          const total = status.messages ?? 0;
          if (total === 0) return [];
          const start = Math.max(1, total - limit + 1);
          const rows: MessageSummary[] = [];
          for await (const msg of c.fetch(`${start}:*`, { uid: true, envelope: true, flags: true, internalDate: true })) {
            rows.push(toSummary(msg, mailbox));
          }
          return rows.reverse();
        } finally {
          lock.release();
        }
      });
    },

    async readMessage(mailbox, uid): Promise<Message | null> {
      return withClient(async (c) => {
        const lock = await c.getMailboxLock(mailbox);
        try {
          const msg = await c.fetchOne(String(uid), { uid: true, envelope: true, flags: true, internalDate: true, source: true }, { uid: true });
          if (!msg || !msg.source) return null;
          const parsed = await simpleParser(msg.source);
          const summary = toSummary(msg, mailbox);
          return {
            ...summary,
            snippet: snippet(parsed.text ?? summary.snippet),
            cc: toAddresses(addrValues(parsed.cc)),
            replyTo: addrValues(parsed.replyTo)[0] ? toAddress(addrValues(parsed.replyTo)[0]) : undefined,
            messageId: parsed.messageId ?? "",
            references: parsed.references ? [parsed.references].flat() : [],
            text: parsed.text ?? "",
            html: typeof parsed.html === "string" ? parsed.html : undefined,
            attachments: (parsed.attachments ?? []).map((a) => ({
              filename: a.filename ?? "attachment",
              contentType: a.contentType ?? "application/octet-stream",
              size: a.size ?? 0
            }))
          };
        } finally {
          lock.release();
        }
      });
    },

    async search({ mailbox = "INBOX", query, limit = 50 }): Promise<MessageSummary[]> {
      return withClient(async (c) => {
        const lock = await c.getMailboxLock(mailbox);
        try {
          // imapflow OR across subject/from/body for a free-text query.
          const uids = await c.search({ or: [{ subject: query }, { from: query }, { body: query }] }, { uid: true });
          if (!uids || uids.length === 0) return [];
          const pick = uids.slice(-limit);
          const rows: MessageSummary[] = [];
          for await (const msg of c.fetch(pick, { uid: true, envelope: true, flags: true, internalDate: true }, { uid: true })) {
            rows.push(toSummary(msg, mailbox));
          }
          return rows.sort((a, b) => b.uid - a.uid);
        } finally {
          lock.release();
        }
      });
    },

    async setFlags(mailbox, uid, flags): Promise<void> {
      await withClient(async (c) => {
        const lock = await c.getMailboxLock(mailbox);
        try {
          const add: string[] = [];
          const remove: string[] = [];
          if (flags.seen === true) add.push("\\Seen");
          if (flags.seen === false) remove.push("\\Seen");
          if (flags.flagged === true) add.push("\\Flagged");
          if (flags.flagged === false) remove.push("\\Flagged");
          if (add.length) await c.messageFlagsAdd({ uid: String(uid) }, add, { uid: true });
          if (remove.length) await c.messageFlagsRemove({ uid: String(uid) }, remove, { uid: true });
        } finally {
          lock.release();
        }
      });
    },

    async deleteMessage(mailbox, uid): Promise<void> {
      await withClient(async (c) => {
        const lock = await c.getMailboxLock(mailbox);
        try {
          await c.messageDelete({ uid: String(uid) }, { uid: true });
        } finally {
          lock.release();
        }
      });
    }
  };
}

// --- SMTP driver (nodemailer) ---

function createNodemailerDriver(config: MailuConfig): SmtpDriver {
  const transport = nodemailer.createTransport({
    host: config.smtp.host,
    port: config.smtp.port,
    secure: config.smtp.secure,
    auth: { user: config.auth.user, pass: config.auth.pass },
    // Verify the cert against its real hostname even when dialing by IP/loopback.
    tls: process.env.AGENTMAIL_SMTP_TLS_SERVERNAME ? { servername: process.env.AGENTMAIL_SMTP_TLS_SERVERNAME } : undefined
  });
  return {
    async send(from: string, draft: Draft) {
      const info = await transport.sendMail({
        from,
        to: draft.to.map(formatAddr),
        cc: draft.cc?.map(formatAddr),
        bcc: draft.bcc?.map(formatAddr),
        subject: draft.subject,
        text: draft.text,
        html: draft.html,
        inReplyTo: draft.inReplyTo,
        references: draft.inReplyTo
      });
      return { messageId: info.messageId };
    }
  };
}

// --- mapping helpers ---

// mailparser types an address header as AddressObject | AddressObject[]; flatten
// to the underlying address list regardless of shape.
function addrValues(a: AddressObject | AddressObject[] | undefined): { name?: string; address?: string }[] {
  if (!a) return [];
  return (Array.isArray(a) ? a : [a]).flatMap((x) => x.value);
}

function toAddress(a: { name?: string; address?: string }): MailAddress {
  return a.name ? { name: a.name, address: a.address ?? "" } : { address: a.address ?? "" };
}

function toAddresses(list: { name?: string; address?: string }[] | undefined): MailAddress[] {
  return (list ?? []).filter((a) => a.address).map(toAddress);
}

function toSummary(msg: FetchMessageObject, mailbox: string): MessageSummary {
  const env = msg.envelope;
  const flags = msg.flags ?? new Set<string>();
  const date = env?.date ?? msg.internalDate ?? new Date();
  const from = toAddresses(env?.from)[0] ?? { address: "" };
  return {
    uid: msg.uid,
    mailbox,
    from,
    to: toAddresses(env?.to),
    subject: env?.subject ?? "",
    date: new Date(date).toISOString(),
    seen: flags.has("\\Seen"),
    flagged: flags.has("\\Flagged"),
    hasAttachments: false,
    snippet: ""
  };
}

function formatAddr(a: MailAddress): string {
  return a.name ? `${a.name} <${a.address}>` : a.address;
}
