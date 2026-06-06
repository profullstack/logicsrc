#!/usr/bin/env sh
set -eu

VERSION="latest"
INSTALL_DIR="${HOME}/.commandboard/bin"
INSTALL_ALIAS=1

while [ "$#" -gt 0 ]; do
  case "$1" in
    --version)
      VERSION="$2"
      shift 2
      ;;
    --install-dir)
      INSTALL_DIR="$2"
      shift 2
      ;;
    --no-alias)
      INSTALL_ALIAS=0
      shift
      ;;
    *)
      echo "Unknown option: $1" >&2
      exit 2
      ;;
  esac
done

OS="$(uname -s | tr '[:upper:]' '[:lower:]')"
ARCH="$(uname -m)"
case "$ARCH" in
  x86_64) ARCH="x64" ;;
  aarch64|arm64) ARCH="arm64" ;;
esac

echo "Installing CommandBoard.run CLI..."
echo "Detected: ${OS} ${ARCH}"
echo "Installing to: ${INSTALL_DIR}"

mkdir -p "$INSTALL_DIR"

cat > "${INSTALL_DIR}/commandboard" <<'BIN'
#!/usr/bin/env sh
echo "CommandBoard.run CLI bootstrap"
echo "Install from a release artifact when v1.0.0 binaries are published."
echo "For local development run: npm --workspace @logicsrc/cli run dev -- \"$@\""
BIN

chmod +x "${INSTALL_DIR}/commandboard"

if [ "$INSTALL_ALIAS" -eq 1 ]; then
  ln -sf "${INSTALL_DIR}/commandboard" "${INSTALL_DIR}/cb"
  echo "Installed alias: cb"
fi

echo "Installed: commandboard (${VERSION})"
echo "Add this to your shell profile if needed:"
echo "export PATH=\"\$HOME/.commandboard/bin:\$PATH\""
echo "Run: commandboard login"
echo "Run: commandboard tui"
