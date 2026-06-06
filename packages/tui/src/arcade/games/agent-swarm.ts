import type { GameAction, KeyEvent, TerminalFrame, WaitingGame } from "../types.js";

export class AgentSwarmGame implements WaitingGame {
  readonly id = "agent-swarm";
  readonly title = "Agent Swarm";
  readonly description = "Route agents around blockers and collect approvals.";
  readonly controls = [
    { key: "Arrow/WASD", action: "move lead agent" },
    { key: "L/Ctrl+G", action: "logs" },
    { key: "Esc", action: "pause" },
    { key: "Q", action: "quit" }
  ];

  private x = 18;
  private y = 8;
  private tickCount = 0;

  init() {
    return;
  }

  tick() {
    this.tickCount += 1;
  }

  input(event: KeyEvent): GameAction | void {
    if (event.ctrl && event.name === "g") return { type: "toggle_logs" };
    if (event.name === "escape") return { type: "pause" };
    if (event.name === "q") return { type: "quit" };
    if (event.name === "l") return { type: "toggle_logs" };
    if (["up", "w", "k"].includes(event.name)) this.y = Math.max(2, this.y - 1);
    if (["down", "s", "j"].includes(event.name)) this.y = Math.min(13, this.y + 1);
    if (["left", "a", "h"].includes(event.name)) this.x = Math.max(4, this.x - 1);
    if (["right", "d"].includes(event.name)) this.x = Math.min(50, this.x + 1);
  }

  render(frame: TerminalFrame) {
    frame.box(0, 0, frame.width, frame.height - 5, this.title.toUpperCase());
    frame.write(2, 4, "Guide the lead agent. Avoid blockers. Grab approvals.");
    frame.write(6, 12, "B");
    frame.write(10, 28, "B");
    frame.write(5, 42, "$");
    frame.write(12, 48, "A");
    frame.write(this.y, this.x, "@");
    frame.write(this.y + 1, Math.max(4, this.x - 4), "a a a");
    frame.write(15, 4, `Swarm pulse: ${this.tickCount % 100}`);
    frame.write(16, 4, "[Arrows/WASD] Move   [L/Ctrl+G] Logs   [Esc] Pause   [Q] Quit");
  }
}
