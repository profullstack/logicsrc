import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { homedir } from "node:os";

export type JsonObject = Record<string, unknown>;

export const defaultConfig: JsonObject = {
  waiting: {
    arcade: {
      enabled: true,
      defaultGame: "hangman",
      random: false,
      autoStartAfterSeconds: 0,
      interruptOnApproval: true,
      interruptOnDone: true,
      interruptOnError: true,
      showTaskStatusOverlay: true
    }
  }
};

export function configPath() {
  return join(homedir(), ".logicsrc", "config.json");
}

export function readConfig() {
  const file = configPath();
  if (!existsSync(file)) {
    return structuredClone(defaultConfig);
  }
  const parsed = JSON.parse(readFileSync(file, "utf8")) as JsonObject;
  return mergeConfig(structuredClone(defaultConfig), parsed);
}

export function writeConfig(config: JsonObject) {
  const file = configPath();
  mkdirSync(dirname(file), { recursive: true });
  writeFileSync(file, JSON.stringify(config, null, 2) + "\n");
  return file;
}

export function getConfigValue(path: string, config = readConfig()) {
  const parts = splitConfigPath(path);
  return parts.reduce<unknown>((current, key) => (isObject(current) ? current[key] : undefined), config);
}

export function setConfigValue(path: string, rawValue: string, config = readConfig()) {
  const parts = splitConfigPath(path);
  let current: JsonObject = config;
  for (const part of parts.slice(0, -1)) {
    if (!isObject(current[part])) {
      current[part] = {};
    }
    current = current[part] as JsonObject;
  }
  current[parts[parts.length - 1] as string] = parseConfigValue(rawValue);
  return config;
}

function splitConfigPath(path: string) {
  const parts = path.split(".");
  const blocked = new Set(["__proto__", "constructor", "prototype"]);
  if (parts.length === 0 || parts.some((part) => part.length === 0)) {
    throw new Error("Config path cannot contain empty segments.");
  }
  if (parts.some((part) => blocked.has(part))) {
    throw new Error("Config path cannot contain prototype keys.");
  }
  return parts;
}

export function parseConfigValue(value: string): unknown {
  if (value === "true") return true;
  if (value === "false") return false;
  if (value === "null") return null;
  if (/^-?\d+(\.\d+)?$/.test(value)) return Number(value);
  try {
    return JSON.parse(value) as unknown;
  } catch {
    return value;
  }
}

function mergeConfig(base: JsonObject, override: JsonObject): JsonObject {
  for (const [key, value] of Object.entries(override)) {
    if (isObject(value) && isObject(base[key])) {
      base[key] = mergeConfig(base[key] as JsonObject, value);
    } else {
      base[key] = value;
    }
  }
  return base;
}

function isObject(value: unknown): value is JsonObject {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
