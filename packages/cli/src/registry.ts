import { createPluginRegistry } from "@logicsrc/plugin-core";
import { coinPayPlugin } from "@logicsrc/plugin-coinpay";
import { uGigPlugin } from "@logicsrc/plugin-ugig";

export function defaultPluginRegistry() {
  return createPluginRegistry([coinPayPlugin, uGigPlugin]);
}
