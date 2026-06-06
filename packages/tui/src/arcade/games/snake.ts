import type { GameAction, GameContext, KeyEvent, TerminalFrame, WaitingGame } from "../types.js";

type Point = { x: number; y: number };

export class SnakeGame implements WaitingGame {
  readonly id = "snake";
  readonly title = "Token Snake";
  readonly description = "Eat task tokens, grow the trail, and avoid blockers.";
  readonly controls = [
    { key: "Arrow/WASD", action: "move" },
    { key: "L/Ctrl+G", action: "logs" },
    { key: "Esc", action: "pause" },
    { key: "Q", action: "quit" }
  ];

  private snake: Point[] = [{ x: 12, y: 6 }];
  private direction: Point = { x: 1, y: 0 };
  private token: Point = { x: 20, y: 6 };
  private elapsed = 0;
  private score = 0;
  private random = Math.random;

  init(ctx: GameContext) {
    this.random = ctx.random;
  }

  tick(deltaMs: number) {
    this.elapsed += deltaMs;
    if (this.elapsed < 150) {
      return;
    }
    this.elapsed = 0;
    const head = this.snake[0] ?? { x: 12, y: 6 };
    const next = { x: head.x + this.direction.x, y: head.y + this.direction.y };
    const maxX = 38;
    const maxY = 12;

    if (next.x < 1 || next.x > maxX || next.y < 1 || next.y > maxY || this.snake.some((point) => point.x === next.x && point.y === next.y)) {
      this.snake = [{ x: 12, y: 6 }];
      this.direction = { x: 1, y: 0 };
      this.score = 0;
      return;
    }

    this.snake.unshift(next);
    if (next.x === this.token.x && next.y === this.token.y) {
      this.score += 1;
      this.token = { x: 1 + Math.floor(this.random() * maxX), y: 1 + Math.floor(this.random() * maxY) };
    } else {
      this.snake.pop();
    }
  }

  input(event: KeyEvent): GameAction | void {
    if (event.ctrl && event.name === "g") return { type: "toggle_logs" };
    if (event.name === "escape") return { type: "pause" };
    if (event.name === "q") return { type: "quit" };
    if (event.name === "l") return { type: "toggle_logs" };
    if (["up", "w", "k"].includes(event.name) && this.direction.y !== 1) this.direction = { x: 0, y: -1 };
    if (["down", "s", "j"].includes(event.name) && this.direction.y !== -1) this.direction = { x: 0, y: 1 };
    if (["left", "a", "h"].includes(event.name) && this.direction.x !== 1) this.direction = { x: -1, y: 0 };
    if (["right", "d", "l"].includes(event.name) && this.direction.x !== -1) this.direction = { x: 1, y: 0 };
  }

  render(frame: TerminalFrame) {
    frame.box(0, 0, frame.width, frame.height - 5, `${this.title.toUpperCase()} SCORE ${this.score}`);
    for (let y = 1; y <= 12; y += 1) {
      for (let x = 1; x <= 38; x += 1) {
        frame.write(y + 2, x + 4, ".");
      }
    }
    frame.write(this.token.y + 2, this.token.x + 4, "$");
    for (const [index, point] of this.snake.entries()) {
      frame.write(point.y + 2, point.x + 4, index === 0 ? "@" : "o");
    }
    frame.write(16, 4, "[Arrows/WASD] Move   [L/Ctrl+G] Logs   [Esc] Pause   [Q] Quit");
  }
}
