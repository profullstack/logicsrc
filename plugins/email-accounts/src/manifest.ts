import type { PluginManifest } from "@logicsrc/plugin-core";

export const emailAccountsManifest: PluginManifest = {
  id: "email-accounts",
  name: "Email Accounts",
  version: "0.1.0",
  type: ["communication", "accounts", "email"],
  default: true,
  capabilities: [
    "accounts.connect",
    "accounts.list",
    "accounts.read_metadata",
    "accounts.test",
    "accounts.revoke",
    "accounts.sync",
    "accounts.audit.read",
    "email.providers.list",
    "email.headers.read",
    "email.body.read",
    "email.attachments.read",
    "email.search",
    "email.draft",
    "email.send",
    "email.labels.modify",
    "email.delete",
    "email.sync"
  ],
  commands: ["accounts", "email"],
  env: [
    "GMAIL_CLIENT_ID",
    "GMAIL_CLIENT_SECRET",
    "MICROSOFT_CLIENT_ID",
    "MICROSOFT_CLIENT_SECRET",
    "IMAP_HOST",
    "IMAP_PORT",
    "SMTP_HOST",
    "SMTP_PORT"
  ]
};
