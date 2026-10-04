/**
 * Chrome over the DevTools protocol, with no dependency: find a binary, start
 * it, and talk to it over one WebSocket in flat session mode.
 *
 * Ported from cli-tools' wcag.ts (findChrome, Cdp, launchBrowser), which `ftb`
 * drives MyFTB with.
 */

import { type ChildProcess, spawn } from "node:child_process";
import { accessSync, constants, mkdirSync, mkdtempSync, readdirSync, rmSync } from "node:fs";
import { homedir, tmpdir } from "node:os";
import { join } from "node:path";
import { ErrandError } from "./util.js";

const isExecutable = (path: string): boolean => {
  try {
    accessSync(path, constants.X_OK);
    return true;
  } catch {
    return false;
  }
};

const listDir = (path: string): string[] => {
  try {
    return readdirSync(path);
  } catch {
    return [];
  }
};

/** `linux-152.0.7977.42` before `linux-131.0.6778.204`: newest first by version. */
const byVersionDesc = (a: string, b: string): number => {
  const parse = (name: string): number[] => (/(\d+(?:\.\d+)*)/.exec(name)?.[1] ?? "0").split(".").map(Number);
  const left = parse(a);
  const right = parse(b);
  for (let i = 0; i < Math.max(left.length, right.length); i += 1) {
    const d = (right[i] ?? 0) - (left[i] ?? 0);
    if (d !== 0) return d;
  }
  return 0;
};

/** Every place a Chrome might be: CHROME_PATH, PATH names, /opt, Puppeteer and Playwright caches, macOS bundles. */
export function chromeCandidates(env: NodeJS.ProcessEnv = process.env, home: string = homedir()): string[] {
  const out: string[] = [];
  if (env.CHROME_PATH) out.push(env.CHROME_PATH);
  for (const name of ["google-chrome", "google-chrome-stable", "chromium", "chromium-browser", "chrome"]) {
    for (const dir of (env.PATH ?? "").split(":").filter(Boolean)) out.push(join(dir, name));
  }
  out.push("/opt/google/chrome/chrome");
  // Full Chrome before the headless shell: a person may need the window (--headful).
  const puppeteer = join(home, ".cache", "puppeteer");
  for (const flavour of ["chrome", "chrome-headless-shell"]) {
    for (const build of listDir(join(puppeteer, flavour)).sort(byVersionDesc)) {
      const dir = join(puppeteer, flavour, build);
      const inner = listDir(dir).find((entry) => entry.startsWith(flavour));
      if (inner) out.push(join(dir, inner, flavour));
    }
  }
  const playwright = join(home, ".cache", "ms-playwright");
  for (const build of listDir(playwright).sort(byVersionDesc)) {
    if (build.startsWith("chromium-")) out.push(join(playwright, build, "chrome-linux", "chrome"));
  }
  out.push("/Applications/Google Chrome.app/Contents/MacOS/Google Chrome");
  out.push("/Applications/Chromium.app/Contents/MacOS/Chromium");
  return out;
}

export function findChrome(env: NodeJS.ProcessEnv = process.env, home: string = homedir(), executable: (path: string) => boolean = isExecutable): string | null {
  return chromeCandidates(env, home).find(executable) ?? null;
}

export const NO_CHROME = `no Chrome found. Pass --chrome PATH or set CHROME_PATH, install one
(apt install chromium, brew install --cask google-chrome), or let Puppeteer fetch one
(npx puppeteer browsers install chrome).`;

interface CdpMessage {
  id?: number;
  method?: string;
  params?: Record<string, unknown>;
  sessionId?: string;
  result?: Record<string, unknown>;
  error?: { message: string };
}

export interface CdpEvent {
  method: string;
  params: Record<string, unknown>;
  sessionId?: string;
}

/** Requests with ids and events by name, over one socket for the browser and every page. */
export class Cdp {
  private nextId = 1;
  private readonly pending = new Map<number, { resolve: (value: Record<string, unknown>) => void; reject: (error: Error) => void }>();
  private readonly listeners = new Set<(message: CdpMessage) => void>();
  private readonly socket: WebSocket;

  constructor(socket: WebSocket) {
    this.socket = socket;
    socket.addEventListener("message", (event) => {
      const message = JSON.parse(String(event.data)) as CdpMessage;
      if (message.id !== undefined && this.pending.has(message.id)) {
        const { resolve, reject } = this.pending.get(message.id)!;
        this.pending.delete(message.id);
        if (message.error) reject(new ErrandError(message.error.message));
        else resolve(message.result ?? {});
        return;
      }
      for (const listener of this.listeners) listener(message);
    });
    socket.addEventListener("close", () => {
      for (const { reject } of this.pending.values()) reject(new ErrandError("browser closed"));
      this.pending.clear();
    });
  }

  static async connect(url: string): Promise<Cdp> {
    const socket = new WebSocket(url);
    await new Promise<void>((resolve, reject) => {
      socket.addEventListener("open", () => resolve(), { once: true });
      socket.addEventListener("error", () => reject(new ErrandError(`could not connect to ${url}`)), { once: true });
    });
    return new Cdp(socket);
  }

  send(method: string, params: Record<string, unknown> = {}, sessionId?: string): Promise<Record<string, unknown>> {
    const id = this.nextId;
    this.nextId += 1;
    return new Promise((resolve, reject) => {
      this.pending.set(id, { resolve, reject });
      this.socket.send(JSON.stringify(sessionId ? { id, method, params, sessionId } : { id, method, params }));
    });
  }

  on(listener: (event: CdpEvent) => void): () => void {
    const wrapped = (message: CdpMessage): void => {
      if (message.method) listener({ method: message.method, params: message.params ?? {}, ...(message.sessionId ? { sessionId: message.sessionId } : {}) });
    };
    this.listeners.add(wrapped);
    return () => this.listeners.delete(wrapped);
  }

  waitFor(method: string, sessionId: string, timeoutMs: number): Promise<void> {
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.listeners.delete(listener);
        reject(new ErrandError(`timed out after ${Math.round(timeoutMs / 1000)}s waiting for ${method}`));
      }, timeoutMs);
      const listener = (message: CdpMessage): void => {
        if (message.method === method && message.sessionId === sessionId) {
          clearTimeout(timer);
          this.listeners.delete(listener);
          resolve();
        }
      };
      this.listeners.add(listener);
    });
  }

  close(): void {
    this.socket.close();
  }
}

export interface Browser {
  cdp: Cdp;
  path: string;
  /** Settles when Chrome ends, including a person closing its window. */
  exited: Promise<void>;
  close(): Promise<void>;
}

export interface LaunchOptions {
  chrome?: string;
  env?: NodeJS.ProcessEnv;
  sandbox?: boolean;
  timeoutMs?: number;
  /** A profile directory to keep between runs; without one a throwaway profile is removed on close. */
  profile?: string;
  /** false opens a window a person can use; the default is headless. */
  headless?: boolean;
  /** Extra Chrome switches. The tests use this to point a hostname at a local fake site. */
  args?: string[];
}

export async function launchBrowser(options: LaunchOptions = {}): Promise<Browser> {
  const env = options.env ?? process.env;
  const path = options.chrome ?? findChrome(env);
  if (!path) throw new ErrandError(NO_CHROME);
  if (!isExecutable(path)) throw new ErrandError(`${path} is not an executable`);

  const keep = options.profile !== undefined;
  if (keep) mkdirSync(options.profile!, { recursive: true, mode: 0o700 });
  const profile = options.profile ?? mkdtempSync(join(tmpdir(), "logicsrc-errand-chrome-"));
  const sandbox = options.sandbox ?? !(env.CHROME_NO_SANDBOX || process.getuid?.() === 0);
  const args = [
    ...(options.headless === false ? [] : ["--headless=new"]),
    "--remote-debugging-port=0",
    `--user-data-dir=${profile}`,
    "--no-first-run",
    "--no-default-browser-check",
    "--disable-gpu",
    "--disable-extensions",
    "--disable-background-networking",
    "--window-size=1280,900",
    ...(sandbox ? [] : ["--no-sandbox"]),
    ...(options.args ?? []),
    "about:blank",
  ];

  const child: ChildProcess = spawn(path, args, { env, stdio: ["ignore", "ignore", "pipe"] });
  const exited = new Promise<void>((resolve) => child.once("exit", () => resolve()));
  const cleanup = (): void => {
    if (keep) return;
    try {
      rmSync(profile, { recursive: true, force: true });
    } catch {
      // Still held open; the next run's tmpdir sweep takes it.
    }
  };

  const url = await new Promise<string>((resolve, reject) => {
    let stderr = "";
    const timeoutMs = options.timeoutMs ?? 20_000;
    const timer = setTimeout(() => reject(new ErrandError(`${path} did not start within ${timeoutMs / 1000}s\n${stderr}`)), timeoutMs);
    child.stderr?.on("data", (chunk: Buffer) => {
      stderr += chunk.toString();
      const match = /DevTools listening on (ws:\/\/\S+)/.exec(stderr);
      if (match?.[1]) {
        clearTimeout(timer);
        resolve(match[1]);
      }
    });
    child.on("exit", (code) => {
      clearTimeout(timer);
      reject(new ErrandError(`${path} exited with ${code ?? "a signal"} before it was ready\n${stderr.trim()}`));
    });
    child.on("error", (error) => {
      clearTimeout(timer);
      reject(new ErrandError(`${path}: ${error.message}`));
    });
  }).catch((error: Error) => {
    child.kill();
    cleanup();
    throw error;
  });

  const cdp = await Cdp.connect(url);
  return {
    cdp,
    path,
    exited,
    async close() {
      try {
        await Promise.race([cdp.send("Browser.close"), new Promise((resolve) => setTimeout(resolve, 2000))]);
      } catch {
        // Already gone.
      }
      // Cookies reach a kept profile on a clean exit: give Chrome one before the kill.
      if (keep) await Promise.race([exited, new Promise((resolve) => setTimeout(resolve, 10_000))]);
      cdp.close();
      child.kill();
      cleanup();
    },
  };
}

/**
 * Rule 11: a runner may present a normal desktop user agent by dropping
 * `HeadlessChrome` from the string. That is all this does: no other header,
 * no navigator patching, no fingerprint change.
 */
export function plainUserAgent(userAgent: string): string | null {
  return userAgent.includes("HeadlessChrome") ? userAgent.replace("HeadlessChrome", "Chrome") : null;
}
