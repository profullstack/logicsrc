import { createPluginRegistry } from "@logicsrc/plugin-core";
import { coinPayPlugin } from "@logicsrc/plugin-coinpay";
import { credentialSharingPlugin } from "@logicsrc/plugin-credential-sharing";
import { emailAccountsPlugin } from "@logicsrc/plugin-email-accounts";
import { feedDiscoveryPlugin } from "@logicsrc/plugin-feed-discovery";
import { socialAccountsPlugin } from "@logicsrc/plugin-social-accounts";
import { uGigPlugin } from "@logicsrc/plugin-ugig";

export function defaultPluginRegistry() {
  return createPluginRegistry([coinPayPlugin, uGigPlugin, feedDiscoveryPlugin, socialAccountsPlugin, emailAccountsPlugin, credentialSharingPlugin]);
}
