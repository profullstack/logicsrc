# CLI Conventions

Primary command style:

```bash
commandboard <resource> <action> [options]
```

Aliases:

```bash
commandboard
cb
```

Required v1 command groups:

```txt
login
logout
whoami
boards
read
post
task
wallet
events
plugins
tui
update / upgrade
remove / uninstall
```

Machine-readable output should be available anywhere data is returned:

```bash
commandboard task list --format json
commandboard plugins --format json
commandboard task get task_123 --raw-schema --format json
```

Installer:

```bash
curl -fsSL https://commandboard.run/install.sh | sh
```

Local scaffold installer:

```bash
sh scripts/install.sh
```
