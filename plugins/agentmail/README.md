# @logicsrc/plugin-agentmail

Agent-native mail for LogicSRC: a paid-member mailbox client (read, search,
compose, send, flag, delete) that works the same for **humans** (a TUI) and
**bots/agents** (the CLI, MCP, or direct service calls), because every method
returns plain JSON-serializable domain objects.

## Design

The plugin follows the LogicSRC plugin pattern (cf. `agentgit`):

- **`domain.ts`** — transport-agnostic types (`Mailbox`, `MessageSummary`,
  `Message`, `Draft`, `MailAddress`) and pure helpers (`parseAddress`,
  `formatAddress`, `normalizeDraft`, `isValidEmail`, `snippet`).
- **`ports.ts`** — the `MailTransport` seam. The service talks only to this.
- **`service.ts`** — `AgentMailService`: paid-gated, ergonomic operations
  (`inbox`, `list`, `read`, `search`, `send`, `reply`, `flag`, `delete`).
- **`access.ts`** — mail is a **Founding Lifetime Member** (paid) perk; every
  call runs `assertPaid`.
- **`transports/memory.ts`** — `InMemoryMailTransport`: a complete, dependency
  free backend for tests, local dev, and as the reference implementation.
- **`transports/mailu.ts`** — the self-hosted Mailu seam
  (`mail.profullstack.com` IMAP + `smtp.profullstack.com` submission). It takes
  **injected** IMAP/SMTP drivers so heavy network libraries stay out of the
  plugin; a consuming app supplies the concrete drivers (e.g. `imapflow` +
  `nodemailer` in Node, or the Go client on the BBS).

## Usage

```ts
import { AgentMailService, InMemoryMailTransport } from "@logicsrc/plugin-agentmail";

const transport = new InMemoryMailTransport();
const mail = new AgentMailService({
  transport,
  identity: { name: "alice", paid: true },
  domain: "mail.profullstack.com"
});

await mail.send({ to: [{ address: "carol@example.com" }], subject: "Hi", text: "hello" });
const inbox = await mail.inbox();
```

Against the real stack:

```ts
import { AgentMailService, createMailuTransport, resolveMailuConfig } from "@logicsrc/plugin-agentmail";

const config = resolveMailuConfig({ user: "alice", pass: process.env.MAIL_PASS! });
const transport = createMailuTransport({ config, imap, smtp }); // imap/smtp: app-provided drivers
const mail = new AgentMailService({ transport, identity: { name: "alice", paid: true }, domain: config.domain });
```

## Config / env

| Var | Default | Meaning |
|---|---|---|
| `AGENTMAIL_DOMAIN` | `mail.profullstack.com` | member address domain |
| `AGENTMAIL_IMAP_HOST` | `mail.profullstack.com` | IMAP host |
| `AGENTMAIL_IMAP_PORT` | `993` | IMAPS port |
| `AGENTMAIL_SMTP_HOST` | `smtp.profullstack.com` | SMTP submission host |
| `AGENTMAIL_SMTP_PORT` | `587` | submission port (STARTTLS) |
