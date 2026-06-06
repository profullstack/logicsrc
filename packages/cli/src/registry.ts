import { createPluginRegistry } from "@logicsrc/plugin-core";
import { coinPayPlugin } from "@logicsrc/plugin-coinpay";
import { sh1ptPlugin } from "@logicsrc/plugin-sh1pt";
import { uGigPlugin } from "@logicsrc/plugin-ugig";

export function defaultPluginRegistry() {
  return createPluginRegistry([coinPayPlugin, uGigPlugin, sh1ptPlugin]);
}
