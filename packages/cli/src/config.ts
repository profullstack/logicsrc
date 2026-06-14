import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { homedir } from "node:os";

export type JsonObject = Record<string, unknown>;

const UNSAFE_CONFIG_KEYS = new Set(["__proto__", "prototype", "constructor"]);

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
  return path.split(".").reduce<unknown>((current, key) => {
    if (UNSAFE_CONFIG_KEYS.has(key) || !isObject(current) || !Object.hasOwn(current, key)) {
      return undefined;
    }
    return current[key];
  }, config);
}

export function setConfigValue(path: string, rawValue: string, config = readConfig()) {
  const parts = path.split(".").filter(Boolean);
  if (parts.length === 0) {
    throw new Error("Config path cannot be empty.");
  }
  parts.forEach(assertSafeConfigKey);
  let current: JsonObject = config;
  for (const part of parts.slice(0, -1)) {
    if (!Object.hasOwn(current, part) || !isObject(current[part])) {
      current[part] = {};
    }
    current = current[part] as JsonObject;
  }
  current[parts[parts.length - 1] as string] = parseConfigValue(rawValue);
  return config;
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

export function mergeConfig(base: JsonObject, override: JsonObject): JsonObject {
  for (const [key, value] of Object.entries(override)) {
    assertSafeConfigKey(key);
    if (isObject(value) && Object.hasOwn(base, key) && isObject(base[key])) {
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

function assertSafeConfigKey(key: string) {
  if (UNSAFE_CONFIG_KEYS.has(key)) {
    throw new Error(`Unsafe config key: ${key}`);
  }
}
