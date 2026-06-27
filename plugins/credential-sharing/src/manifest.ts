import type { PluginManifest } from "@logicsrc/plugin-core";

export const credentialSharingManifest: PluginManifest = {
  id: "credential-sharing",
  name: "Credential Sharing",
  version: "0.1.0",
  type: ["credentials", "secrets", "sync"],
  default: true,
  capabilities: [
    "credentials.providers.list",
    "credentials.inspect",
    "credentials.diff",
    "credentials.plan",
    "credentials.approve",
    "credentials.sync",
    "credentials.rollback",
    "credentials.audit.read",
    "credentials.export"
  ],
  commands: ["credentials"],
  env: ["DOPPLER_TOKEN", "RAILWAY_TOKEN", "GITHUB_TOKEN", "LOGICSRC_CREDENTIAL_HOME"]
};
