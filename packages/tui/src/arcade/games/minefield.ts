import type { GameAction, GameContext, KeyEvent, TerminalFrame, WaitingGame } from "../types.js";

type Cell = { mine: boolean; open: boolean; flag: boolean };

export class MinefieldGame implements WaitingGame {
  readonly id = "minefield";
  readonly title = "Deploy Minefield";
  readonly description = "Clear risky deployment cells without triggering incidents.";
  readonly controls = [
    { key: "Arrow/WASD", action: "move" },
    { key: "Space/Enter", action: "reveal" },
    { key: "F", action: "flag" },
    { key: "Q", action: "quit" }
  ];

  private width = 8;
  private height = 6;
  private cells: Cell[] = [];
  private cursor = { x: 0, y: 0 };
  private state = "clear risky cells";

  init(ctx: GameContext) {
    this.cells = Array.from({ length: this.width * this.height }, (_, index) => ({
      mine: index > 0 && ctx.random() < 0.16,
      open: false,
      flag: false
    }));
  }

  tick() {
    return;
  }

  input(event: KeyEvent): GameAction | void {
    if (event.ctrl && event.name === "g") return { type: "toggle_logs" };
    if (event.name === "escape") return { type: "pause" };
    if (event.name === "q") return { type: "quit" };
    if (event.name === "l") return { type: "toggle_logs" };
    if (["up", "w", "k"].includes(event.name)) this.cursor.y = Math.max(0, this.cursor.y - 1);
    if (["down", "s", "j"].includes(event.name)) this.cursor.y = Math.min(this.height - 1, this.cursor.y + 1);
    if (["left", "a", "h"].includes(event.name)) this.cursor.x = Math.max(0, this.cursor.x - 1);
    if (["right", "d"].includes(event.name)) this.cursor.x = Math.min(this.width - 1, this.cursor.x + 1);
    if (event.name === "f") this.cell(this.cursor.x, this.cursor.y).flag = !this.cell(this.cursor.x, this.cursor.y).flag;
    if (event.name === "space" || event.name === "return") this.reveal(this.cursor.x, this.cursor.y);
  }

  render(frame: TerminalFrame) {
    frame.box(0, 0, frame.width, frame.height - 5, this.title.toUpperCase());
    frame.write(2, 4, `Status: ${this.state}`);
    for (let y = 0; y < this.height; y += 1) {
      for (let x = 0; x < this.width; x += 1) {
        const cell = this.cell(x, y);
        const selected = this.cursor.x === x && this.cursor.y === y;
        const value = cell.flag ? "F" : cell.open ? (cell.mine ? "!" : String(this.neighbors(x, y))) : "#";
        frame.write(4 + y, 6 + x * 4, selected ? `[${value}]` : ` ${value} `);
      }
    }
    frame.write(12, 4, "[Arrows/WASD] Move   [Space/Enter] Reveal   [F] Flag   [Q] Quit");
  }

  private reveal(x: number, y: number) {
    const cell = this.cell(x, y);
    if (cell.flag) return;
    cell.open = true;
    this.state = cell.mine ? "incident triggered; keep mapping the blast radius" : "cell cleared";
  }

  private cell(x: number, y: number) {
    return this.cells[y * this.width + x] ?? { mine: false, open: false, flag: false };
  }

  private neighbors(x: number, y: number) {
    let count = 0;
    for (let dy = -1; dy <= 1; dy += 1) {
      for (let dx = -1; dx <= 1; dx += 1) {
        if (dx !== 0 || dy !== 0) {
          count += this.cell(x + dx, y + dy).mine ? 1 : 0;
        }
      }
    }
    return count;
  }
}
