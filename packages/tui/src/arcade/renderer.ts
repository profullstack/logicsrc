import type { TaskSnapshot, TerminalFrame } from "./types.js";

export class TextFrame implements TerminalFrame {
  readonly width: number;
  readonly height: number;
  private readonly cells: string[][];

  constructor(width: number, height: number) {
    this.width = Math.max(40, width);
    this.height = Math.max(16, height);
    this.cells = Array.from({ length: this.height }, () => Array.from({ length: this.width }, () => " "));
  }

  write(row: number, col: number, text: string) {
    if (row < 0 || row >= this.height || col >= this.width) {
      return;
    }

    for (let index = 0; index < text.length && col + index < this.width; index += 1) {
      if (col + index >= 0) {
        this.cells[row][col + index] = text[index] ?? " ";
      }
    }
  }

  box(row: number, col: number, width: number, height: number, title?: string) {
    const right = Math.min(this.width - 1, col + width - 1);
    const bottom = Math.min(this.height - 1, row + height - 1);
    const left = Math.max(0, col);
    const top = Math.max(0, row);

    for (let x = left; x <= right; x += 1) {
      this.write(top, x, x === left || x === right ? "+" : "-");
      this.write(bottom, x, x === left || x === right ? "+" : "-");
    }
    for (let y = top + 1; y < bottom; y += 1) {
      this.write(y, left, "|");
      this.write(y, right, "|");
    }
    if (title) {
      this.write(top, left + 2, ` ${fit(title, Math.max(0, width - 6))} `);
    }
  }

  toString() {
    return this.cells.map((line) => line.join("").trimEnd()).join("\n").trimEnd();
  }
}

export function fit(value: string, width: number) {
  if (width <= 0) {
    return "";
  }
  return value.length > width ? value.slice(0, Math.max(0, width - 1)) + "." : value.padEnd(width);
}

export function center(value: string, width: number) {
  if (value.length >= width) {
    return value.slice(0, width);
  }
  const left = Math.floor((width - value.length) / 2);
  return `${" ".repeat(left)}${value}`;
}

export function renderTaskOverlay(frame: TerminalFrame, task: TaskSnapshot | undefined, standalone: boolean) {
  const top = frame.height - 5;
  frame.box(top, 0, frame.width, 5, standalone ? "STANDALONE MODE" : "TASK STATUS");

  if (!task) {
    frame.write(top + 1, 2, "No active task. Play mode only.");
    frame.write(top + 2, 2, "[L/Ctrl+G] logs  [Esc] pause  [Q] quit");
    return;
  }

  const cost = typeof task.costUsd === "number" ? ` Cost: $${task.costUsd.toFixed(2)}` : "";
  const progress = typeof task.progress === "number" ? ` ${Math.round(task.progress * 100)}%` : "";
  frame.write(top + 1, 2, fit(`Task: ${task.title}`, frame.width - 4));
  frame.write(top + 2, 2, fit(`Status: ${task.status}${progress} Phase: ${task.phase ?? "unknown"}${cost}`, frame.width - 4));
  frame.write(top + 3, 2, fit(`Last: ${task.lastMessage ?? "waiting for task events"}   [L/Ctrl+G] logs  [Esc] pause  [Q] quit`, frame.width - 4));
}

export function renderModal(title: string, body: string[], actions: string[], width = 58) {
  const inner = width - 4;
  const lines = [
    `+${"=".repeat(width - 2)}+`,
    `| ${fit(title, inner)} |`,
    `|${" ".repeat(width - 2)}|`
  ];

  for (const line of body) {
    lines.push(`| ${fit(line, inner)} |`);
  }

  lines.push(`|${" ".repeat(width - 2)}|`);
  lines.push(`| ${fit(actions.join("   "), inner)} |`);
  lines.push(`+${"=".repeat(width - 2)}+`);
  return lines.join("\n");
}
