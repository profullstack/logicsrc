import type { GameAction, GameContext, KeyEvent, TerminalFrame, WaitingGame } from "../types.js";
import { fit } from "../renderer.js";

const WORDS = ["LOGICSRC", "COMMAND BOARD", "AGENT SWARM", "PULL REQUEST", "TERMINAL", "SUPABASE", "COINPAY", "CRAWLPROOF", "UGIG", "SHIPT"];
const BAD_IDEAS = ["JIRA", "WATERFALL", "WEBPACK", "XML CONFIG", "VENDOR LOCK-IN", "MEETING", "BIG REWRITE", "GLOBAL STATE"];

export class HangmanGame implements WaitingGame {
  readonly id = "hangman";
  readonly title = "Logicsrc Hangman";
  readonly description = "Guess terminal, agent, and Logicsrc words while a task runs.";
  readonly controls = [
    { key: "A-Z", action: "guess" },
    { key: "L/Ctrl+G", action: "logs" },
    { key: "Esc", action: "pause" },
    { key: "Q", action: "quit" }
  ];

  private word = WORDS[0] ?? "LOGICSRC";
  private guesses = new Set<string>();
  private mistakes = 0;

  init(ctx: GameContext) {
    this.word = WORDS[Math.floor(ctx.random() * WORDS.length)] ?? "LOGICSRC";
  }

  tick() {
    return;
  }

  input(event: KeyEvent): GameAction | void {
    if (event.ctrl && event.name === "g") {
      return { type: "toggle_logs" };
    }
    if (event.name === "escape") {
      return { type: "pause" };
    }
    if (event.name === "q") {
      return { type: "quit" };
    }
    if (event.name === "l") {
      return { type: "toggle_logs" };
    }
    if (/^[a-z]$/i.test(event.name)) {
      const guess = event.name.toUpperCase();
      if (!this.guesses.has(guess)) {
        this.guesses.add(guess);
        if (!this.word.includes(guess)) {
          this.mistakes += 1;
        }
      }
    }
  }

  render(frame: TerminalFrame) {
    frame.box(0, 0, frame.width, frame.height - 5, this.title.toUpperCase());
    frame.write(2, 4, "Phrase:");
    frame.write(4, 4, this.maskedWord());
    frame.write(6, 4, `Wrong guesses: ${this.mistakes}/6`);
    frame.write(7, 4, BAD_IDEAS.slice(0, this.mistakes).join("  ") || "none yet");
    frame.write(9, 4, fit(`Guessed: ${Array.from(this.guesses).sort().join(" ") || "none"}`, frame.width - 8));

    const state = this.isWon() ? "solved" : this.mistakes >= 6 ? "reset with R or keep guessing" : "running";
    frame.write(11, 4, `Round: ${state}`);
    frame.write(13, 4, "[A-Z] Guess   [L/Ctrl+G] Logs   [Esc] Pause   [Q] Quit");
  }

  private maskedWord() {
    return this.word
      .split("")
      .map((char) => (char === " " ? "  " : this.guesses.has(char) ? `${char} ` : "_ "))
      .join("");
  }

  private isWon() {
    return this.word.split("").every((char) => char === " " || this.guesses.has(char));
  }
}
