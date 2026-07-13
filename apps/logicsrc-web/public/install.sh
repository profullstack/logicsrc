#!/bin/sh
# LogicSRC — one-line installer for the `logicsrc` CLI (from the GitHub repo).
#
#   curl -fsSL https://logicsrc.com/install.sh | sh
#
# Subcommands:
#   curl -fsSL https://logicsrc.com/install.sh | sh -s -- install     (default)
#   curl -fsSL https://logicsrc.com/install.sh | sh -s -- update
#   curl -fsSL https://logicsrc.com/install.sh | sh -s -- uninstall
#
# What it does:
#   1. Detects OS (Linux/macOS — Windows: use WSL) and requires Node 18+.
#   2. Fetches the repo tarball from GitHub into $LOGICSRC_HOME/src.
#   3. `npm install` + `npm run build:cli` (builds only the CLI's workspaces).
#   4. Drops a `logicsrc` wrapper on $HOME/.local/bin.
#
# Env overrides:
#   LOGICSRC_HOME=/path        install dir     (default: $HOME/.logicsrc-cli)
#   LOGICSRC_BIN=/path/dir     wrapper bin dir (default: $HOME/.local/bin)
#   LOGICSRC_REF=branch|tag    git ref         (default: master)
set -eu

GH_REPO="profullstack/logicsrc"
LOGICSRC_REF="${LOGICSRC_REF:-master}"
TARBALL_URL="https://codeload.github.com/$GH_REPO/tar.gz/$LOGICSRC_REF"

# --- operator identity (curl|sh may land with HOME/USER unset) ---
_home() { if [ -n "${HOME:-}" ] && [ -d "$HOME" ]; then echo "$HOME"; else echo "${HOME:-/tmp}"; fi; }
HOME="$(_home)"; export HOME
LOGICSRC_HOME="${LOGICSRC_HOME:-$HOME/.logicsrc-cli}"
LOGICSRC_BIN="${LOGICSRC_BIN:-$HOME/.local/bin}"
SRC_DIR="$LOGICSRC_HOME/src"
WRAPPER="$LOGICSRC_BIN/logicsrc"

if [ -t 1 ] && [ -z "${NO_COLOR:-}" ]; then
  G=$(printf '\033[32m'); Y=$(printf '\033[33m'); B=$(printf '\033[34m'); R=$(printf '\033[31m'); X=$(printf '\033[0m')
else G=''; Y=''; B=''; R=''; X=''; fi
info() { printf '%s==>%s %s\n' "$B" "$X" "$*"; }
ok()   { printf '%s ✓%s %s\n' "$G" "$X" "$*"; }
warn() { printf '%s !%s %s\n' "$Y" "$X" "$*" >&2; }
fail() { printf '%s ✗%s %s\n' "$R" "$X" "$*" >&2; exit 1; }

need() { command -v "$1" >/dev/null 2>&1 || fail "missing '$1' — please install it and re-run."; }

detect_os() {
  case "$(uname -s)" in
    Linux) : ;; Darwin) : ;;
    *) fail "unsupported OS (Linux and macOS only — Windows: use WSL)";;
  esac
}

check_node() {
  need node
  major="$(node -p 'process.versions.node.split(".")[0]' 2>/dev/null || echo 0)"
  [ "$major" -ge 18 ] 2>/dev/null || fail "Node 18+ required (found $(node -v 2>/dev/null || echo none)). Install from https://nodejs.org or via mise/nvm."
  need npm
}

do_install() {
  detect_os; check_node
  need curl; need tar
  info "fetching logicsrc@$LOGICSRC_REF from GitHub…"
  mkdir -p "$SRC_DIR"
  tmp="$(mktemp -d)"
  curl -fsSL "$TARBALL_URL" | tar -xz -C "$tmp" --strip-components=1
  rm -rf "$SRC_DIR"; mkdir -p "$(dirname "$SRC_DIR")"; mv "$tmp" "$SRC_DIR"
  ok "downloaded to $SRC_DIR"

  info "installing dependencies (this can take a minute)…"
  ( cd "$SRC_DIR" && npm install --no-audit --no-fund --ignore-scripts >/dev/null 2>&1 ) || fail "npm install failed — run it by hand in $SRC_DIR"
  info "building the CLI…"
  ( cd "$SRC_DIR" && npm run build:cli >/dev/null 2>&1 ) || fail "build failed — run 'npm run build:cli' in $SRC_DIR"

  mkdir -p "$LOGICSRC_BIN"
  cat > "$WRAPPER" <<EOF
#!/bin/sh
exec node "$SRC_DIR/packages/cli/dist/index.js" "\$@"
EOF
  chmod +x "$WRAPPER"
  ok "installed logicsrc → $WRAPPER"

  case ":$PATH:" in
    *":$LOGICSRC_BIN:"*) : ;;
    *) warn "add $LOGICSRC_BIN to your PATH:  export PATH=\"$LOGICSRC_BIN:\$PATH\"";;
  esac
  printf '\n%s🔐 logicsrc installed.%s  Next:\n   logicsrc login\n   logicsrc teams push <team> prod --env .env\n\n' "$G" "$X"
}

do_uninstall() {
  rm -f "$WRAPPER"; rm -rf "$LOGICSRC_HOME"
  ok "removed logicsrc ($WRAPPER, $LOGICSRC_HOME)"
}

case "${1:-install}" in
  install|update|upgrade) do_install ;;
  remove|uninstall) do_uninstall ;;
  *) fail "unknown command '$1' (install | update | uninstall)";;
esac
