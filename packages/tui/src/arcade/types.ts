export interface GameControl {
  key: string;
  action: string;
}

export interface KeyEvent {
  name: string;
  sequence: string;
  ctrl?: boolean;
}

export type GameAction =
  | { type: "quit" }
  | { type: "pause" }
  | { type: "toggle_logs" }
  | { type: "redraw" }
  | { type: "message"; message: string };

export interface TaskSnapshot {
  id: string;
  title: string;
  status: "queued" | "running" | "paused" | "approval_required" | "done" | "error" | "cancelled";
  phase?: string;
  progress?: number;
  costUsd?: number;
  lastMessage?: string;
}

export type TaskEvent =
  | { type: "task:started"; task: TaskSnapshot }
  | { type: "task:progress"; task: TaskSnapshot }
  | { type: "task:log"; line: string; timestamp: string }
  | { type: "task:approval_required"; task: TaskSnapshot; reason: string }
  | { type: "task:expense_required"; task: TaskSnapshot; provider: string; amountUsd: number; reason: string }
  | { type: "task:done"; task: TaskSnapshot; result: string }
  | { type: "task:error"; task: TaskSnapshot; error: string }
  | { type: "task:cancelled"; task: TaskSnapshot };

export type ArcadeEvent = { type: "game:score"; score: number } | { type: "game:message"; message: string };

export interface GameContext {
  width: number;
  height: number;
  random: () => number;
  task?: TaskSnapshot;
  emit: (event: ArcadeEvent) => void;
}

export interface WaitingGame {
  id: string;
  title: string;
  description: string;
  controls: GameControl[];

  init(ctx: GameContext): void | Promise<void>;
  tick(deltaMs: number): void;
  input(event: KeyEvent): GameAction | void;
  render(frame: TerminalFrame): void;

  pause?(): void;
  resume?(): void;
  stop?(): void;
}

export interface TerminalFrame {
  width: number;
  height: number;
  write(row: number, col: number, text: string): void;
  box(row: number, col: number, width: number, height: number, title?: string): void;
  toString(): string;
}
