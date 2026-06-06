# Config

Logicsrc stores user config at:

```text
$HOME/.logicsrc/config.json
```

Read and write values with dot paths:

```bash
logicsrc config get waiting.arcade.enabled
logicsrc config set waiting.arcade.enabled true
logicsrc config set waiting.arcade.defaultGame hangman
logicsrc config set waiting.arcade.autoStartAfterSeconds 15
```

Default Waiting Arcade config:

```json
{
  "waiting": {
    "arcade": {
      "enabled": true,
      "defaultGame": "hangman",
      "random": false,
      "autoStartAfterSeconds": 0,
      "interruptOnApproval": true,
      "interruptOnDone": true,
      "interruptOnError": true,
      "showTaskStatusOverlay": true
    }
  }
}
```

Precedence for arcade launch behavior is:

1. CLI flags
2. Environment variables
3. User config
4. Defaults

Environment variables:

```bash
LOGICSRC_ARCADE=1
LOGICSRC_ARCADE_GAME=hangman
LOGICSRC_NO_ARCADE=1
LOGICSRC_ARCADE_AUTOSTART_SECONDS=15
```
