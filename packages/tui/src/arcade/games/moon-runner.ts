import type { GameAction, GameContext, KeyEvent, TerminalFrame, WaitingGame } from "../types.js";

export class MoonRunnerGame implements WaitingGame {
  readonly id = "moon-runner";
  readonly title = "Moon Runner";
  readonly description = "Jump over failed builds and collect green checks.";
  readonly controls = [
    { key: "Space/Up", action: "jump" },
    { key: "L/Ctrl+G", action: "logs" },
    { key: "Esc", action: "pause" },
    { key: "Q", action: "quit" }
  ];

  private runnerY = 0;
  private velocity = 0;
  private obstacleX = 46;
  private score = 0;
  private random = Math.random;

  init(ctx: GameContext) {
    this.random = ctx.random;
  }

  tick(deltaMs: number) {
    const step = Math.max(1, Math.round(deltaMs / 60));
    this.obstacleX -= step;
    if (this.obstacleX < 4) {
      this.obstacleX = 42 + Math.floor(this.random() * 24);
      this.score += 1;
    }
    this.velocity -= 0.08 * step;
    this.runnerY = Math.max(0, this.runnerY + this.velocity);
    if (this.runnerY === 0 && this.velocity < 0) {
      this.velocity = 0;
    }
    if (this.obstacleX >= 8 && this.obstacleX <= 10 && this.runnerY < 1) {
      this.score = 0;
      this.obstacleX = 46;
    }
  }

  input(event: KeyEvent): GameAction | void {
    if (event.ctrl && event.name === "g") return { type: "toggle_logs" };
    if (event.name === "escape") return { type: "pause" };
    if (event.name === "q") return { type: "quit" };
    if (event.name === "l") return { type: "toggle_logs" };
    if (["space", "up", "w"].includes(event.name) && this.runnerY === 0) {
      this.velocity = 1.15;
    }
  }

  render(frame: TerminalFrame) {
    const ground = Math.max(7, frame.height - 9);
    frame.box(0, 0, frame.width, frame.height - 5, `${this.title.toUpperCase()} CHECKS ${this.score}`);
    frame.write(ground + 1, 4, "_".repeat(Math.max(10, frame.width - 8)));
    frame.write(ground - Math.round(this.runnerY), 9, "@");
    frame.write(ground, this.obstacleX, "X");
    frame.write(ground - 2, Math.max(18, this.obstacleX + 10), "+");
    frame.write(2, 4, "Low gravity. High uptime.");
    frame.write(ground + 3, 4, "[Space/Up] Jump   [L/Ctrl+G] Logs   [Esc] Pause   [Q] Quit");
  }
}
