import type { LogicSrcAccountProviderManifest } from "@logicsrc/account-core";

export const emailAccountProviderManifests: LogicSrcAccountProviderManifest[] = [
  {
    id: "imap-smtp",
    name: "IMAP + SMTP",
    kind: "email",
    authMethods: ["imap_smtp"],
    capabilities: ["email.headers.read", "email.search", "email.draft", "email.send"],
    defaultScopes: ["imap.read", "smtp.send"],
    status: "planned"
  },
  {
    id: "gmail",
    name: "Gmail",
    kind: "email",
    authMethods: ["oauth2"],
    capabilities: ["email.headers.read", "email.search", "email.body.read", "email.draft", "email.send", "email.labels.modify"],
    defaultScopes: ["https://www.googleapis.com/auth/gmail.metadata"],
    status: "planned"
  },
  {
    id: "microsoft-graph",
    name: "Microsoft Graph / Outlook",
    kind: "email",
    authMethods: ["oauth2"],
    capabilities: ["email.headers.read", "email.search", "email.body.read", "email.draft", "email.send"],
    defaultScopes: ["Mail.ReadBasic", "Mail.Send", "offline_access"],
    status: "planned"
  },
  {
    id: "forwardemail",
    name: "ForwardEmail.net",
    kind: "email",
    authMethods: ["imap_smtp", "api_key"],
    capabilities: ["email.headers.read", "email.search", "email.draft", "email.send"],
    defaultScopes: ["imap.read", "smtp.send"],
    status: "planned"
  }
];
