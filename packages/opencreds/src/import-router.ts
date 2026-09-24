/**
 * One place that decides which reader owns a file.
 *
 * Before this, format was inferred inline in the import command by
 * `text.startsWith("{")`, and `--source` only ever reached the CSV reader. So a
 * JSON or archive export could not be forced at all: if the sniff was wrong there
 * was no way to say "this came from 1Password".
 *
 * A source here names a *product*, not a file format. Bitwarden exports JSON and
 * CSV; 1Password exports .1pux and CSV. Saying `--source onepassword` says where
 * the file came from, and the container is still decided by looking at the bytes.
 */
import { IMPORT_SOURCES, parseCsvImport } from "./importers.js";
import { looksLikeBitwardenText, parseBitwardenJson } from "./bitwarden.js";
import {
  looksLikeOnePasswordExport,
  parseOnePasswordExport,
} from "./onepassword.js";
import { looksLikeZip } from "./zip.js";
import type { ParsedImport } from "./types.js";

/** What the bytes are, independent of which product made them. */
export type Container = "opencreds" | "json" | "csv" | "zip";

export interface SourceInfo {
  /** What a person calls it. */
  label: string;
  /** Containers this product is known to export. */
  containers: Container[];
}

/**
 * Every product that can be named with --source.
 *
 * `opencreds` is included so an OpenCreds database can be forced too — it is the
 * one format that is also our own, and a person moving between logicsrc vaults
 * should not have to know it is the default JSON branch.
 */
export const ALL_SOURCES: Readonly<Record<string, SourceInfo>> = Object.freeze({
  opencreds: { label: "OpenCreds / logicsrc", containers: ["opencreds"] },
  bitwarden: { label: "Bitwarden", containers: ["json", "csv"] },
  onepassword: { label: "1Password", containers: ["zip", "csv"] },
  lastpass: { label: "LastPass", containers: ["csv"] },
  keepass: { label: "KeePass", containers: ["csv"] },
  nordpass: { label: "NordPass", containers: ["csv"] },
  dashlane: { label: "Dashlane", containers: ["csv"] },
  protonpass: { label: "Proton Pass", containers: ["csv"] },
  roboform: { label: "RoboForm", containers: ["csv"] },
  apple: { label: "Apple Passwords", containers: ["csv"] },
  firefox: { label: "Firefox", containers: ["csv"] },
  chrome: { label: "Chrome / Edge", containers: ["csv"] },
});

/** The names `--source` accepts, for help text and error messages. */
export const SOURCE_NAMES: readonly string[] = Object.freeze(Object.keys(ALL_SOURCES));

/** A one-line list of what can be passed to --source. */
export function sourceHelp(): string {
  return SOURCE_NAMES.map((name) => `${name} (${ALL_SOURCES[name]!.label})`).join(", ");
}

export function isKnownSource(name: string): boolean {
  return Object.hasOwn(ALL_SOURCES, name);
}

/** What kind of file is this? */
export function detectContainer(buf: Buffer): Container {
  if (looksLikeZip(buf)) return "zip";
  const head = buf.subarray(0, 64).toString("utf8").trimStart();
  if (head.startsWith("{") || head.startsWith("[")) return "json";
  return "csv";
}

export interface RouteResult {
  /** null when nothing could read it. */
  parsed: ParsedImport | null;
  /** Set when the file is an OpenCreds database — the caller owns that path. */
  isOpenCredsDatabase: boolean;
  /** Human-readable description of what was chosen, for the run's output. */
  description: string;
  /** Why nothing could read it, when parsed is null. */
  reason?: string;
}

/**
 * Decide which reader owns a file and run it.
 *
 * An OpenCreds database is handed back rather than parsed: it needs a passphrase
 * prompt and a manifest check that only the command can do.
 */
export function routeImport(buf: Buffer, forced?: string): RouteResult {
  const container = detectContainer(buf);
  const text = container === "zip" ? "" : buf.toString("utf8");

  if (forced && !isKnownSource(forced)) {
    return {
      parsed: null,
      isOpenCredsDatabase: false,
      description: "",
      reason: `Unknown --source "${forced}". Valid sources: ${SOURCE_NAMES.join(", ")}`,
    };
  }

  // 1Password's archive. Forced or sniffed, it is the only zip we read.
  if (container === "zip") {
    if (forced && forced !== "onepassword") {
      return {
        parsed: null,
        isOpenCredsDatabase: false,
        description: "",
        reason: `${ALL_SOURCES[forced]!.label} does not export a ZIP archive`,
      };
    }
    if (!looksLikeOnePasswordExport(buf)) {
      return {
        parsed: null,
        isOpenCredsDatabase: false,
        description: "",
        reason: "A ZIP, but not a 1Password .1pux (no export.data inside)",
      };
    }
    return {
      parsed: parseOnePasswordExport(buf),
      isOpenCredsDatabase: false,
      description: "1Password .1pux",
    };
  }

  if (container === "json") {
    const bitwarden = looksLikeBitwardenText(text);

    if (forced === "bitwarden" || (!forced && bitwarden)) {
      return {
        parsed: parseBitwardenJson(text),
        isOpenCredsDatabase: false,
        description: "Bitwarden JSON",
      };
    }
    if (forced === "opencreds" || !forced) {
      // Left to the caller: only it can prompt for a passphrase.
      return { parsed: null, isOpenCredsDatabase: true, description: "OpenCreds database" };
    }
    return {
      parsed: null,
      isOpenCredsDatabase: false,
      description: "",
      reason: `${ALL_SOURCES[forced]!.label} does not export JSON — its export is CSV`,
    };
  }

  // Everything else is treated as CSV, forced to a source or detected by header.
  if (forced === "opencreds") {
    return {
      parsed: null,
      isOpenCredsDatabase: false,
      description: "",
      reason: "An OpenCreds database is JSON, and this file is not",
    };
  }
  const csvSource = forced && Object.hasOwn(IMPORT_SOURCES, forced) ? forced : undefined;
  if (forced && !csvSource) {
    return {
      parsed: null,
      isOpenCredsDatabase: false,
      description: "",
      reason: `No CSV reader for ${ALL_SOURCES[forced]!.label}`,
    };
  }
  const parsed = parseCsvImport(text, csvSource ? { source: csvSource } : {});
  return {
    parsed,
    isOpenCredsDatabase: false,
    description: parsed.source
      ? `${IMPORT_SOURCES[parsed.source]?.label ?? parsed.source} CSV`
      : "CSV",
  };
}
