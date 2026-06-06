# TUI

The Logicsrc TUI package contains terminal rendering helpers for the static dashboard and Waiting Arcade.

```bash
logicsrc tui
logicsrc arcade
logicsrc arcade play snake
```

Waiting Arcade is dependency-free and runs inside the terminal. It uses keyboard input only and falls back to a static snapshot when stdout or stdin is not a TTY.

Task integrations should emit progress, log, approval, expense, completion, and error events into the arcade runtime so attention events can pause the game and show an actionable modal.
