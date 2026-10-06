#!/usr/bin/env bash
# Checks the package as npm would ship it: packs the tarball, lints its manifest with publint,
# installs it into a fresh project the way the docs say to, and runs `dekc` from there. A file
# missing from `files`, or a `bin` that points nowhere, fails here instead of after publishing.
set -euo pipefail

root="$(cd "$(dirname "$0")/.." && pwd)"
work="$(mktemp -d)"
trap 'rm -rf "$work"' EXIT

cd "$root"
tarball="$work/$(npm pack --silent --pack-destination "$work")"
bunx publint@0.3 run "$tarball" --strict

# `bunx @hajimism/dek init`, then `bun add -d @hajimism/dek`, with the tarball standing in for npm.
mkdir "$work/boot"
cd "$work/boot"
echo '{}' > package.json
bun add -d "$tarball" > /dev/null
bunx dekc init talks --deck demo > /dev/null
cd talks
bun add -d "$tarball" > /dev/null
# The skill ships with the version it describes, wherever the install put the package.
installed="$(bun -e 'console.log(require.resolve("@hajimism/dek/package.json"))')"
test -f "$(dirname "$installed")/skills/dek/SKILL.md"
cd decks/demo
bunx dekc --version
bunx dekc ls > /dev/null 2>&1
bunx dekc lint > /dev/null 2>&1
bunx dekc build > /dev/null 2>&1
test -f dist/demo.html
echo "package ok: $(basename "$tarball")"
