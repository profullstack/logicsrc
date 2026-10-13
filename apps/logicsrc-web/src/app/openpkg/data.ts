// The facts the /openpkg landing page shows, kept apart from page.tsx so
// contract/openpkg.contract.test.ts can hold them against docs/openpkg.md.

/** The target documents a repository serves, in the order docs/openpkg.md defines them. */
export const TARGETS: Array<[string, string]> = [
  ["packages/index.json", "What the repository offers: each package identity and the path of its channel indexes. Candidates, not ownership."],
  ["channels/<name>/<channel>.json", "The releases on one channel, and an explicit revoked list of artifact digests. Omission is not revocation."],
  ["manifests/<name>/<version>.json", "One immutable release: requirements that fail closed, one artifact per platform with its length, SHA-256, unpacked size limit and commands. No hooks."],
  ["catalog/index.json", "Tools with no signed repository, each with its publisher's https curl installer. The listing is signed; the script is not."]
];

/** Exit codes, in the order of the ## 6.2 Exit codes table. */
export const EXIT_CODES: Array<[string, string]> = [
  ["0", "OK. Current, pinned or held is not an error."],
  ["1", "A package operation failed."],
  ["2", "Invalid arguments, an ambiguous name or invalid configuration."],
  ["3", "Approval or a trust decision is required."],
  ["4", "A global security, state or environment preflight failed."],
  ["5", "Another client holds the mutation lock."],
  ["130", "Interrupted."]
];
