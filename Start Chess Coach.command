#!/bin/sh
# Resolve the project directory even when launched through a desktop symlink.
launcher="$0"
while [ -L "$launcher" ]; do
  launcher_dir=$(CDPATH= cd -P -- "$(dirname -- "$launcher")" && pwd)
  launcher_target=$(readlink -- "$launcher")
  case "$launcher_target" in
    /*) launcher="$launcher_target" ;;
    *) launcher="$launcher_dir/$launcher_target" ;;
  esac
done
project_dir=$(CDPATH= cd -P -- "$(dirname -- "$launcher")" && pwd) || exit 1
cd "$project_dir" || exit 1
if ! command -v node >/dev/null 2>&1; then
  echo "Node.js is required. Install Node.js 22.12 or later, then run npm ci in this folder."
  exit 1
fi
exec node scripts/start.mjs
