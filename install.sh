#!/usr/bin/env bash
# Agentic Browser installer.
#
#   From a checkout:   ./install.sh [--yes] [--dry-run] [--firefox] ...
#   From nothing:      bash <(curl -fsSL https://raw.githubusercontent.com/tashifkhan/agentic-browser/main/install.sh)
#
# The second form clones the repo into ~/agentic-browser (or $AGENTIC_BROWSER_DIR)
# first. Read the script before piping it into a shell.
set -euo pipefail

if ! command -v python3 >/dev/null 2>&1; then
  echo "The installer needs python3. On macOS: xcode-select --install" >&2
  exit 1
fi

here="$(cd "$(dirname "${BASH_SOURCE[0]:-$0}")" 2>/dev/null && pwd || true)"
if [[ -n "$here" && -f "$here/scripts/install.py" ]]; then
  exec python3 "$here/scripts/install.py" "$@"
fi

dir="${AGENTIC_BROWSER_DIR:-$HOME/agentic-browser}"
if [[ -d "$dir/.git" ]]; then
  echo "Updating $dir"
  git -C "$dir" pull --ff-only
else
  echo "Cloning into $dir"
  git clone https://github.com/tashifkhan/agentic-browser.git "$dir"
fi
exec python3 "$dir/scripts/install.py" "$@"
