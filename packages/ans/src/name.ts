import type { AnsName } from './types.js';

const LABEL = /^[a-z0-9]([a-z0-9-]*[a-z0-9])?$/i;
// ans://v<major.minor.patch[-prerelease]>.<agent>.<domain>
// The version's dotted core (X.Y.Z) is anchored so it doesn't get confused with
// the agent/domain labels. Prerelease is dot-free in M1 to keep the boundary
// unambiguous; build metadata (+...) is M2.
const ANS = /^ans:\/\/v(\d+\.\d+\.\d+(?:-[0-9A-Za-z-]+)?)\.([a-z0-9](?:[a-z0-9-]*[a-z0-9])?)\.(.+)$/i;

/**
 * Parse an `ans://v<semver>.<agent>.<domain>` name. The version is `v<semver>`,
 * the agent is a single DNS label, and the domain is one or more labels after
 * it. Throws on a malformed name.
 */
export function parseAnsName(raw: string): AnsName {
  const match = ANS.exec(raw.trim());
  if (!match) throw new Error(`malformed ans name — got ${raw}`);
  const [, version, agent, domain] = match;

  if (!LABEL.test(agent)) throw new Error(`ans name has invalid agent label — got ${agent}`);
  if (!domain || domain.split('.').some((label) => !LABEL.test(label))) {
    throw new Error(`ans name has invalid domain — got ${domain}`);
  }

  return { raw: `ans://v${version}.${agent}.${domain}`, version, agent, domain };
}

export function formatAnsName(parts: { version: string; agent: string; domain: string }): string {
  return parseAnsName(`ans://v${parts.version}.${parts.agent}.${parts.domain}`).raw;
}

export function toAnsName(name: string | AnsName): AnsName {
  return typeof name === 'string' ? parseAnsName(name) : name;
}
