export interface PluginManifest {
  id: string;
  name: string;
  version: string;
  type: string[];
  default: boolean;
  capabilities: string[];
  commands: string[];
  env: string[];
}

export interface PluginConfig {
  enabled?: boolean;
  [key: string]: unknown;
}

export interface PluginDefinition {
  manifest: PluginManifest;
  configDefaults?: PluginConfig;
  routes?: PluginRoute[];
  events?: PluginEventHandler[];
  permissions?: string[];
  tuiPanels?: PluginPanel[];
}

export interface PluginRoute {
  method: "GET" | "POST" | "PUT" | "PATCH" | "DELETE";
  path: string;
  capability: string;
}

export interface PluginEventHandler {
  event: string;
  capability: string;
}

export interface PluginPanel {
  id: string;
  title: string;
}

export interface LoadedPlugin {
  definition: PluginDefinition;
  config: PluginConfig;
  enabled: boolean;
}

export interface PluginRegistrySnapshot {
  plugins: Array<{
    id: string;
    name: string;
    version: string;
    enabled: boolean;
    default: boolean;
    type: string[];
    capabilities: string[];
    commands: string[];
  }>;
  capabilities: Record<string, string[]>;
}
