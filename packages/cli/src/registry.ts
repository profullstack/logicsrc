import { createPluginRegistry } from "@logicsrc/plugin-core";
import { agentBbsPlugin } from "@logicsrc/plugin-agentbbs";
import { coinPayPlugin } from "@logicsrc/plugin-coinpay";
import { emailAccountsPlugin } from "@logicsrc/plugin-email-accounts";
import { feedDiscoveryPlugin } from "@logicsrc/plugin-feed-discovery";
import { socialAccountsPlugin } from "@logicsrc/plugin-social-accounts";
import { uGigPlugin } from "@logicsrc/plugin-ugig";

export function defaultPluginRegistry() {
  return createPluginRegistry([coinPayPlugin, uGigPlugin, feedDiscoveryPlugin, socialAccountsPlugin, emailAccountsPlugin, agentBbsPlugin]);
}
