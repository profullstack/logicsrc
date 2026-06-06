import { createDefaultArcadeRegistry, type ArcadeRegistry } from "./registry.js";
import { fit, renderModal, renderTaskOverlay, TextFrame } from "./renderer.js";
import type { KeyEvent, TaskEvent, TaskSnapshot, WaitingGame } from "./types.js";

export interface ArcadeSessionOptions {
  game?: string | boolean;
  standalone?: boolean;
  task?: TaskSnapshot;
  logs?: string[];
  registry?: ArcadeRegistry;
  input?: NodeJS.ReadStream;
  output?: NodeJS.WriteStream;
  simulateTask?: boolean;
}

type Modal =
  | { kind: "pause"; title: string; body: string[]; actions: string[] }
  | { kind: "complete"; title: string; body: string[]; actions: string[] }
  | { kind: "approval"; title: string; body: string[]; actions: string[] }
  | { kind: "error"; title: string; body: string[]; actions: string[] };

export function renderArcadeSnapshot(options: ArcadeSessionOptions = {}) {
  const registry = options.registry ?? createDefaultArcadeRegistry();
  const gameId = registry.choose(typeof options.game === "string" ? options.game : undefined);
  const game = registry.create(gameId);
  const task = options.task;
  const frame = new TextFrame(80, 28);
  game.init({ width: frame.width, height: frame.height, random: Math.random, task, emit: () => undefined });
  game.render(frame);
  renderTaskOverlay(frame, task, options.standalone ?? true);
  return frame.toString();
}

export async function runArcadeSession(options: ArcadeSessionOptions = {}) {
  const input = options.input ?? process.stdin;
  const output = options.output ?? process.stdout;
  const registry = options.registry ?? createDefaultArcadeRegistry();
  const gameId = registry.choose(typeof options.game === "string" ? options.game : undefined);
  const game = registry.create(gameId);
  let task = options.task;
  const logs = [...(options.logs ?? [])];

  if (!input.isTTY || !output.isTTY) {
    output.write(renderArcadeSnapshot({ ...options, game: gameId, task, logs }) + "\n");
    if (!options.standalone) {
      output.write("\nWaiting Arcade interactive mode is disabled outside an interactive terminal.\n");
    }
    return;
  }

  await game.init({ width: output.columns ?? 80, height: output.rows ?? 28, random: Math.random, task, emit: () => undefined });

  let modal: Modal | undefined;
  let showLogs = false;
  let closed = false;
  let lastFrameAt = Date.now();
  let cleanupComplete = false;
  const previousRawMode = input.isRaw;

  const cleanup = () => {
    if (cleanupComplete) {
      return;
    }
    cleanupComplete = true;
    clearInterval(loop);
    for (const timer of timers) {
      clearTimeout(timer);
    }
    input.off("data", onData);
    process.off("SIGINT", onSigint);
    if (input.isTTY) {
      input.setRawMode(previousRawMode ?? false);
    }
    input.pause();
    output.write("\x1b[?25h\x1b[?1049l");
  };

  const onSigint = () => {
    closed = true;
    cleanup();
  };

  const onData = (data: Buffer) => {
    const event = parseKey(data);
    if (event.ctrl && event.name === "c") {
      modal = { kind: "pause", title: "STOP TASK?", body: ["Ctrl+C received.", "Press Q to quit arcade, or Esc to continue."], actions: ["[Q] Quit", "[Esc] Continue"] };
      return;
    }

    if (showLogs) {
      if (event.name === "escape" || event.name === "l" || (event.ctrl && event.name === "g")) {
        showLogs = false;
      }
      return;
    }

    if (modal) {
      if (event.name === "q") {
        closed = true;
        cleanup();
      } else if (event.name === "l" || (event.ctrl && event.name === "g")) {
        showLogs = true;
      } else if (event.name === "escape" || event.name === "c" || event.name === "a" || event.name === "d" || event.name === "r") {
        modal = undefined;
        game.resume?.();
      }
      return;
    }

    const action = game.input(event);
    if (action?.type === "quit") {
      closed = true;
      cleanup();
    } else if (action?.type === "pause") {
      game.pause?.();
      modal = { kind: "pause", title: "ARCADE PAUSED", body: ["Task continues in the background."], actions: ["[Esc/C] Continue", "[L] Logs", "[Q] Quit"] };
    } else if (action?.type === "toggle_logs") {
      showLogs = true;
    } else if (action?.type === "redraw") {
      render();
    }
  };

  const applyTaskEvent = (event: TaskEvent) => {
    if ("task" in event) {
      task = event.task;
    }
    if (event.type === "task:log") {
      logs.push(`[${event.timestamp}] ${event.line}`);
    }
    if (event.type === "task:approval_required" || event.type === "task:expense_required" || event.type === "task:done" || event.type === "task:error") {
      game.pause?.();
    }
    if (event.type === "task:approval_required") {
      modal = { kind: "approval", title: "APPROVAL REQUIRED", body: [event.reason], actions: ["[A] Approve", "[D] Deny", "[L] Logs", "[P] Pause Job"] };
    }
    if (event.type === "task:expense_required") {
      modal = { kind: "approval", title: "EXPENSE APPROVAL", body: [`Provider: ${event.provider}`, `Cost: $${event.amountUsd.toFixed(2)}`, event.reason], actions: ["[A] Approve", "[D] Deny", "[L] Logs"] };
    }
    if (event.type === "task:done") {
      modal = { kind: "complete", title: "TASK COMPLETE", body: [event.result, `Cost: $${event.task.costUsd?.toFixed(2) ?? "0.00"}`], actions: ["[R] Review", "[L] Logs", "[C] Continue", "[Q] Quit"] };
    }
    if (event.type === "task:error") {
      modal = { kind: "error", title: "TASK FAILED", body: [event.error], actions: ["[R] Retry", "[L] Logs", "[Q] Quit"] };
    }
  };

  const timers = options.simulateTask ? createDemoTaskEvents(applyTaskEvent) : [];

  input.setRawMode(true);
  input.resume();
  input.on("data", onData);
  process.on("SIGINT", onSigint);
  output.write("\x1b[?1049h\x1b[?25l");

  const render = () => {
    if (closed) {
      return;
    }
    const width = output.columns ?? 80;
    const height = output.rows ?? 28;
    const frame = new TextFrame(width, height);
    if (showLogs) {
      renderLogs(frame, logs);
    } else {
      game.render(frame);
      renderTaskOverlay(frame, task, options.standalone ?? true);
    }
    output.write(`\x1b[H\x1b[2J${frame.toString()}`);
    if (modal) {
      output.write("\n\n" + renderModal(modal.title, modal.body, modal.actions));
    }
  };

  const loop = setInterval(() => {
    const now = Date.now();
    if (!modal && !showLogs) {
      game.tick(now - lastFrameAt);
    }
    lastFrameAt = now;
    render();
  }, 66);

  render();

  await new Promise<void>((resolve) => {
    const done = setInterval(() => {
      if (closed) {
        clearInterval(done);
        resolve();
      }
    }, 50);
  });
}

function renderLogs(frame: TextFrame, logs: string[]) {
  frame.box(0, 0, frame.width, frame.height, "TASK LOGS");
  const visible = logs.slice(-(frame.height - 4));
  if (visible.length === 0) {
    frame.write(2, 2, "No logs yet.");
  }
  for (const [index, line] of visible.entries()) {
    frame.write(2 + index, 2, fit(line, frame.width - 4));
  }
  frame.write(frame.height - 2, 2, "[Esc/L/Ctrl+G] close logs");
}

function parseKey(data: Buffer): KeyEvent {
  const sequence = data.toString("utf8");
  if (sequence === "\u0003") return { name: "c", sequence, ctrl: true };
  if (sequence === "\u0007") return { name: "g", sequence, ctrl: true };
  if (sequence === "\u001b") return { name: "escape", sequence };
  if (sequence === "\r") return { name: "return", sequence };
  if (sequence === " ") return { name: "space", sequence };
  if (sequence === "\u001b[A") return { name: "up", sequence };
  if (sequence === "\u001b[B") return { name: "down", sequence };
  if (sequence === "\u001b[C") return { name: "right", sequence };
  if (sequence === "\u001b[D") return { name: "left", sequence };
  return { name: sequence.toLowerCase(), sequence };
}

function createDemoTaskEvents(apply: (event: TaskEvent) => void) {
  const started: TaskSnapshot = {
    id: "demo_yolo",
    title: "AgentSwarm YOLO session",
    status: "running",
    phase: "inspecting repo",
    progress: 0.2,
    costUsd: 0.08,
    lastMessage: "cloned repo"
  };

  return [
    setTimeout(() => apply({ type: "task:started", task: started }), 250),
    setTimeout(() => apply({ type: "task:log", timestamp: new Date().toISOString(), line: "agent swarm inspected issue context" }), 900),
    setTimeout(
      () =>
        apply({
          type: "task:progress",
          task: { ...started, phase: "running tests", progress: 0.58, costUsd: 0.21, lastMessage: "generated patch" }
        }),
      2200
    ),
    setTimeout(
      () =>
        apply({
          type: "task:expense_required",
          task: { ...started, status: "approval_required", phase: "browser QA", progress: 0.72, costUsd: 0.21, lastMessage: "approval required" },
          provider: "Browserless",
          amountUsd: 0.18,
          reason: "Verify checkout flow before opening the PR."
        }),
      5200
    ),
    setTimeout(
      () =>
        apply({
          type: "task:done",
          task: { ...started, status: "done", phase: "complete", progress: 1, costUsd: 0.72, lastMessage: "PR ready for review" },
          result: "PR #184 is ready for review. Tests passed."
        }),
      11000
    )
  ];
}
