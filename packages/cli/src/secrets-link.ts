import { chmodSync, existsSync, mkdirSync, readFileSync, realpathSync, renameSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { logicsrcHome } from "@logicsrc/plugin-credential-sharing";

export interface SecretsLink {
  directory: string;
  team: string;
  project: string;
  env: string;
  linkedAt: string;
}

interface SecretsLinkStore {
  version: 1;
  links: Record<string, SecretsLink>;
}

const emptyStore = (): SecretsLinkStore => ({ version: 1, links: {} });

export function secretsLinksPath(): string {
  return join(logicsrcHome(), "secrets-links.json");
}

/** Resolve aliases/symlinks so the same directory cannot acquire two links. */
export function linkedDirectory(directory = process.cwd()): string {
  const absolute = resolve(directory);
  return existsSync(absolute) ? realpathSync(absolute) : absolute;
}

function readStore(file: string): SecretsLinkStore {
  if (!existsSync(file)) return emptyStore();
  const parsed = JSON.parse(readFileSync(file, "utf8")) as Partial<SecretsLinkStore>;
  if (parsed.version !== 1 || !parsed.links || typeof parsed.links !== "object" || Array.isArray(parsed.links)) {
    throw new Error(`Invalid secrets link file: ${file}`);
  }
  return { version: 1, links: parsed.links } as SecretsLinkStore;
}

export function readSecretsLink(directory = process.cwd(), file = secretsLinksPath()): SecretsLink | undefined {
  return readStore(file).links[linkedDirectory(directory)];
}

export function requireSecretsLink(directory = process.cwd(), file = secretsLinksPath()): SecretsLink {
  const resolved = linkedDirectory(directory);
  const link = readStore(file).links[resolved];
  if (!link) {
    throw new Error(`No team secrets are linked to ${resolved}. Run: logicsrc secrets teams link`);
  }
  return link;
}

export function writeSecretsLink(
  target: Pick<SecretsLink, "team" | "project" | "env">,
  directory = process.cwd(),
  file = secretsLinksPath()
): SecretsLink {
  const resolved = linkedDirectory(directory);
  const store = readStore(file);
  const link: SecretsLink = {
    directory: resolved,
    team: target.team,
    project: target.project,
    env: target.env,
    linkedAt: new Date().toISOString()
  };
  store.links[resolved] = link;

  mkdirSync(dirname(file), { recursive: true, mode: 0o700 });
  const temporary = `${file}.${process.pid}.tmp`;
  writeFileSync(temporary, JSON.stringify(store, null, 2) + "\n", { mode: 0o600 });
  chmodSync(temporary, 0o600);
  renameSync(temporary, file);
  chmodSync(file, 0o600);
  return link;
}
