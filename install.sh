#!/bin/sh
# Agentic Browser installer.
#
#   From nothing:      curl -fsSL https://tashif.codes/agentic-browser:install | sh
#   With options:      curl -fsSL https://tashif.codes/agentic-browser:install | sh -s -- --yes
#   From a checkout:   ./install.sh [--yes] [--dry-run] [--firefox] ...
#
# Piped in, it clones the repo into ~/agentic-browser (or $AGENTIC_BROWSER_DIR)
# first. Read the script before piping it into a shell.
set -eu

if ! command -v python3 >/dev/null 2>&1; then
  echo "The installer needs python3. On macOS: xcode-select --install" >&2
  exit 1
fi

case "$0" in
  */install.sh | install.sh)
    here=$(cd "$(dirname "$0")" && pwd)
    if [ -f "$here/scripts/install.py" ]; then
      set -- "$here" "$@"; shift_dir=1
    fi
    ;;
esac

if [ "${shift_dir:-0}" = 0 ]; then
  if ! command -v git >/dev/null 2>&1; then
    echo "The installer needs git. On macOS: xcode-select --install" >&2
    exit 1
  fi
  dir="${AGENTIC_BROWSER_DIR:-$HOME/agentic-browser}"
  if [ -d "$dir/.git" ]; then
    echo "Updating $dir"
    git -C "$dir" pull --ff-only
  else
    echo "Cloning into $dir"
    git clone https://github.com/tashifkhan/agentic-browser.git "$dir"
  fi
  set -- "$dir" "$@"
fi

dir=$1; shift
# The installer asks questions. Piped into sh, stdin is the script itself,
# so read answers from the terminal when there is one.
if [ ! -t 0 ] && (exec </dev/tty) 2>/dev/null; then
  exec python3 "$dir/scripts/install.py" "$@" </dev/tty
fi
exec python3 "$dir/scripts/install.py" "$@"
