import { validate } from "@logicsrc/validators";
import type { LoadedPlugin, PluginConfig, PluginDefinition, PluginManifest, PluginRegistrySnapshot } from "./types.js";

export class PluginManifestError extends Error {
  constructor(id: string, message: string) {
    super(`Invalid plugin manifest for ${id}: ${message}`);
  }
}

export class PluginRegistry {
  private readonly plugins = new Map<string, LoadedPlugin>();

  register(definition: PluginDefinition, config: PluginConfig = {}) {
    validateManifest(definition.manifest);

    const id = definition.manifest.id;
    if (this.plugins.has(id)) {
      throw new Error(`Plugin "${id}" is already registered`);
    }

    const mergedConfig = {
      ...definition.configDefaults,
      ...config
    };

    this.plugins.set(id, {
      definition,
      config: mergedConfig,
      enabled: mergedConfig.enabled !== false
    });

    return this;
  }

  get(id: string) {
    return this.plugins.get(id);
  }

  list() {
    return [...this.plugins.values()];
  }

  enabled() {
    return this.list().filter((plugin) => plugin.enabled);
  }

  byCapability(capability: string) {
    return this.enabled().filter((plugin) => plugin.definition.manifest.capabilities.includes(capability));
  }

  snapshot(): PluginRegistrySnapshot {
    const capabilities: Record<string, string[]> = {};

    for (const plugin of this.enabled()) {
      for (const capability of plugin.definition.manifest.capabilities) {
        capabilities[capability] ??= [];
        capabilities[capability].push(plugin.definition.manifest.id);
      }
    }

    return {
      plugins: this.list().map((plugin) => ({
        id: plugin.definition.manifest.id,
        name: plugin.definition.manifest.name,
        version: plugin.definition.manifest.version,
        enabled: plugin.enabled,
        default: plugin.definition.manifest.default,
        type: plugin.definition.manifest.type,
        capabilities: plugin.definition.manifest.capabilities,
        commands: plugin.definition.manifest.commands
      })),
      capabilities
    };
  }
}

export function validateManifest(manifest: PluginManifest) {
  const result = validate("plugin", manifest);
  if (!result.ok) {
    const message = result.errors.map((error: { instancePath?: string; message?: string }) => `${error.instancePath || "/"} ${error.message}`).join("; ");
    throw new PluginManifestError(manifest.id ?? "unknown", message);
  }
}

export function createPluginRegistry(definitions: PluginDefinition[], config: Record<string, PluginConfig> = {}) {
  const registry = new PluginRegistry();

  for (const definition of definitions) {
    registry.register(definition, config[definition.manifest.id] ?? {});
  }

  return registry;
}

export type {
  LoadedPlugin,
  PluginConfig,
  PluginDefinition,
  PluginEventHandler,
  PluginManifest,
  PluginPanel,
  PluginRegistrySnapshot,
  PluginRoute
} from "./types.js";
