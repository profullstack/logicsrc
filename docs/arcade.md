# Waiting Arcade

Waiting Arcade lets you play small terminal games while Logicsrc runs long tasks.

```bash
logicsrc arcade list
logicsrc arcade play hangman
logicsrc --yolo --arcade=hangman
logicsrc agentswarm --yolo --arcade=random
logicsrc agentswarm --yolo --no-arcade
```

Built-in games:

- `hangman`
- `snake`
- `moon-runner`
- `minefield`
- `agent-swarm`

Use `random` to pick a built-in game.

## Task Mode

When arcade mode is launched from `--yolo` or `agentswarm --yolo`, the task continues in the background. The game shows a compact task overlay with status, phase, progress, last message, and cost when available.

The arcade pauses immediately when the task completes, fails, needs approval, or needs expense approval. Expense approval requires an explicit modal action; the game never silently approves cost.

## Shortcuts

| Key | Action |
| --- | --- |
| `L` / `Ctrl+G` | Toggle task logs |
| `Esc` | Pause game |
| `Q` | Quit arcade |
| `Ctrl+C` | Open stop prompt in interactive mode |
| `Arrow` / `WASD` | Move in supported games |

## Non-Interactive Terminals

In CI or redirected output, Waiting Arcade does not enter raw interactive mode. It prints a static arcade snapshot and returns without changing terminal state.

## Safety

The runtime restores raw mode, cursor visibility, and the alternate screen on normal exit or `Ctrl+C`. Quitting the arcade does not imply task approval.
