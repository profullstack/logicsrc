import type { LogicSrcAccountKind, LogicSrcAccountProviderManifest } from "./types.js";

export function createProviderRegistry(providers: LogicSrcAccountProviderManifest[]) {
  const byId = new Map<string, LogicSrcAccountProviderManifest>();

  for (const provider of providers) {
    if (byId.has(provider.id)) {
      throw new Error(`Duplicate account provider: ${provider.id}`);
    }
    byId.set(provider.id, provider);
  }

  return {
    list(kind?: LogicSrcAccountKind) {
      return providers.filter((provider) => !kind || provider.kind === kind);
    },
    get(id: string) {
      return byId.get(id);
    },
    require(id: string) {
      const provider = byId.get(id);
      if (!provider) {
        throw new Error(`Unknown account provider: ${id}`);
      }
      return provider;
    }
  };
}
