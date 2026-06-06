import type { WaitingGame } from "./types.js";
import { AgentSwarmGame } from "./games/agent-swarm.js";
import { HangmanGame } from "./games/hangman.js";
import { MinefieldGame } from "./games/minefield.js";
import { MoonRunnerGame } from "./games/moon-runner.js";
import { SnakeGame } from "./games/snake.js";

export type GameFactory = () => WaitingGame;

export class ArcadeRegistry {
  private readonly games = new Map<string, GameFactory>();

  add(factory: GameFactory) {
    const game = factory();
    if (this.games.has(game.id)) {
      throw new Error(`Arcade game already registered: ${game.id}`);
    }
    this.games.set(game.id, factory);
  }

  create(id: string) {
    const factory = this.games.get(id);
    if (!factory) {
      throw new Error(`Unknown arcade game "${id}". Run "logicsrc arcade list" to see available games.`);
    }
    return factory();
  }

  list() {
    return Array.from(this.games.values()).map((factory) => {
      const game = factory();
      return {
        id: game.id,
        title: game.title,
        description: game.description,
        controls: game.controls
      };
    });
  }

  choose(id: string | undefined, random = Math.random) {
    if (!id || id === "default") {
      return "hangman";
    }
    if (id !== "random") {
      return id;
    }
    const games = this.list();
    return games[Math.floor(random() * games.length)]?.id ?? "hangman";
  }
}

export function createDefaultArcadeRegistry() {
  const registry = new ArcadeRegistry();
  registry.add(() => new HangmanGame());
  registry.add(() => new SnakeGame());
  registry.add(() => new MoonRunnerGame());
  registry.add(() => new MinefieldGame());
  registry.add(() => new AgentSwarmGame());
  return registry;
}

export function renderArcadeList(registry = createDefaultArcadeRegistry()) {
  const rows = registry.list();
  const idWidth = Math.max(...rows.map((row) => row.id.length), 2);
  const titleWidth = Math.max(...rows.map((row) => row.title.length), 5);

  return [
    "Waiting Arcade games",
    "",
    `${"id".padEnd(idWidth)}  ${"title".padEnd(titleWidth)}  description`,
    `${"-".repeat(idWidth)}  ${"-".repeat(titleWidth)}  ${"-".repeat(40)}`,
    ...rows.map((row) => `${row.id.padEnd(idWidth)}  ${row.title.padEnd(titleWidth)}  ${row.description}`)
  ].join("\n");
}
