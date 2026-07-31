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
#   2. Fetches the repo tarball from GitHub into a staging dir.
#   3. `npm install` + `npm run build:cli` (builds only the CLI's workspaces)
#      there, then swaps it into $LOGICSRC_HOME/src only once it built. A failed
#      run leaves any existing install untouched.
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

# Commit the tracked ref currently points at. The .sha media type returns it as
# bare text, so this needs no jq. Empty on failure — never fatal, since a missing
# sha only costs `logicsrc update` its precision.
resolve_sha() {
  _sha="$(curl -fsSL -H "Accept: application/vnd.github.sha" \
    "https://api.github.com/repos/$GH_REPO/commits/$LOGICSRC_REF" 2>/dev/null || true)"
  # Anything that is not a commit id is dropped rather than recorded: an error
  # page or a proxy's HTML would otherwise be written into install.json as the
  # commit, and `logicsrc update` compares against that string.
  case "$_sha" in
    *[!0-9a-f]* | "") echo "" ;;
    *) [ "${#_sha}" = 40 ] && echo "$_sha" || echo "" ;;
  esac
}

# Records what we installed so `logicsrc update` can compare against the remote.
# Without this the CLI has no way to know which commit it is running, and can
# only ever guess that it is current.
write_manifest() {
  _version="$(node -p "require('$SRC_DIR/packages/cli/package.json').version" 2>/dev/null || echo '')"
  cat > "$LOGICSRC_HOME/install.json" <<EOF
{
  "ref": "$LOGICSRC_REF",
  "commit": "$1",
  "version": "$_version",
  "installed_at": "$(date -u +%Y-%m-%dT%H:%M:%SZ)"
}
EOF
}

# Everything is built in a staging directory and only swapped in once it works,
# so a failed or interrupted run cannot leave a half-installed tree behind.
#
# It used to `rm -rf "$SRC_DIR"` before building. If the build then failed --
# or the run was interrupted, or the machine went to sleep -- you were left with
# no dist/, a wrapper still pointing at it, and a manifest from the previous
# install claiming success. Every later `logicsrc` invocation died with
# MODULE_NOT_FOUND and nothing said why.
#
# Staging lives inside $LOGICSRC_HOME rather than /tmp so the swap is a rename
# on the same filesystem, not a cross-device copy of node_modules.
STAGE="$LOGICSRC_HOME/.staging.$$"
PREV="$LOGICSRC_HOME/.previous.$$"
BUILD_LOG="${TMPDIR:-/tmp}/logicsrc-install.$$.log"

cleanup_stage() { rm -rf "$STAGE" "$PREV"; }

# Build output is captured rather than discarded: "build failed" with no reason
# is not a diagnosis. The log survives so it can be read or pasted.
step_fail() {
  printf '%s ✗%s %s\n' "$R" "$X" "$1" >&2
  if [ -s "$BUILD_LOG" ]; then
    printf '\n%s--- last 25 lines ---%s\n' "$Y" "$X" >&2
    tail -n 25 "$BUILD_LOG" >&2
    printf '%s--- full log: %s ---%s\n' "$Y" "$BUILD_LOG" "$X" >&2
  fi
  printf '\nyour existing install was left untouched.\n' >&2
  cleanup_stage
  exit 1
}

do_install() {
  detect_os; check_node
  need curl; need tar
  trap cleanup_stage INT TERM HUP

  info "fetching logicsrc@$LOGICSRC_REF from GitHub…"
  mkdir -p "$LOGICSRC_HOME"
  sha="$(resolve_sha)"
  short_sha="$(printf '%.7s' "$sha")"
  rm -rf "$STAGE"; mkdir -p "$STAGE"
  curl -fsSL "$TARBALL_URL" | tar -xz -C "$STAGE" --strip-components=1 \
    || step_fail "download failed — could not fetch $TARBALL_URL"
  ok "downloaded${short_sha:+ ($short_sha)}"

  info "installing dependencies (this can take a minute)…"
  ( cd "$STAGE" && npm install --no-audit --no-fund --ignore-scripts ) >"$BUILD_LOG" 2>&1 \
    || step_fail "npm install failed"
  info "building the CLI…"
  ( cd "$STAGE" && npm run build:cli ) >>"$BUILD_LOG" 2>&1 \
    || step_fail "build failed"

  # The wrapper execs this exact file, so its absence is the failure the user
  # would otherwise only discover on their next command.
  [ -f "$STAGE/packages/cli/dist/index.js" ] \
    || step_fail "build produced no packages/cli/dist/index.js"

  # Swap. This is the first point at which a working install is touched.
  rm -rf "$PREV"
  [ -d "$SRC_DIR" ] && mv "$SRC_DIR" "$PREV"
  mv "$STAGE" "$SRC_DIR" || { [ -d "$PREV" ] && mv "$PREV" "$SRC_DIR"; step_fail "could not move the build into $SRC_DIR"; }
  rm -rf "$PREV"
  rm -f "$BUILD_LOG"
  trap - INT TERM HUP

  mkdir -p "$LOGICSRC_BIN"
  cat > "$WRAPPER" <<EOF
#!/bin/sh
exec node "$SRC_DIR/packages/cli/dist/index.js" "\$@"
EOF
  chmod +x "$WRAPPER"
  write_manifest "$sha"
  ok "installed logicsrc → $WRAPPER"

  case ":$PATH:" in
    *":$LOGICSRC_BIN:"*) : ;;
    *) warn "add $LOGICSRC_BIN to your PATH:  export PATH=\"$LOGICSRC_BIN:\$PATH\"";;
  esac
  # <team> <project> <env> -- three positionals. Two exits with a usage error.
  printf '\n%s🔐 logicsrc installed.%s  Next:\n   logicsrc login\n   logicsrc teams push <team> <project> <env>\n\n' "$G" "$X"
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
