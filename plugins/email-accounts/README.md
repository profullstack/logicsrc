# LogicSRC Email Accounts Plugin

First-party LogicSRC plugin for connecting and governing email inboxes and outbound sending identities.

Initial provider manifests are intentionally contract-only. Live IMAP/SMTP, Gmail, and Microsoft Graph providers should be added behind `EmailAccountProvider` from `@logicsrc/account-core` after credential broker, approval, and audit persistence are available.
