/**
 * Swarm and member ids.
 *
 * A swarm id is a short slug of the task and the UTC minute it was minted:
 * `create-two-0541`. Member ids in a swarm are `<swarm>-<n>`. Both double as
 * moshcode pane names, which must match `^[a-z][a-z0-9_-]{0,31}$`, so the slug
 * is capped at 23 characters and starts with a letter: 23 + 5 for the minute
 * + 3 for `-16` stays inside 32.
 */

export const NAME_RE = /^[a-z][a-z0-9_-]{0,31}$/;

export const SLUG_MAX = 23;

/** Lowercase, dashes for anything else, leading letter, at most `max` characters, never empty. */
export function slug(text: string, max = SLUG_MAX): string {
  let out = String(text ?? "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^[^a-z]+/, "")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");
  if (out.length > max) out = out.slice(0, max).replace(/-+$/, "");
  return out || "swarm";
}

/** `<slug>-<HHMM UTC>`, e.g. `create-two-0541` for "create two ..." minted at 05:41Z. */
export function swarmId(task: string, now: Date = new Date()): string {
  const hh = String(now.getUTCHours()).padStart(2, "0");
  const mm = String(now.getUTCMinutes()).padStart(2, "0");
  return `${slug(task)}-${hh}${mm}`;
}

export function memberId(swarm: string, n: number): string {
  return `${swarm}-${n}`;
}

/** `<parent>-<n>` for a swarm of one, with `n` one past the swarms already minted under that parent. */
export function nextSwarmOfOne(parent: string, existingSwarms: string[]): string {
  const pattern = new RegExp(`^${parent.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}-(\\d+)$`);
  let max = 0;
  for (const swarm of existingSwarms) {
    const match = swarm.match(pattern);
    if (match) max = Math.max(max, Number(match[1]));
  }
  return `${parent}-${max + 1}`;
}
