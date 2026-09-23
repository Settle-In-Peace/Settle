#!/bin/bash
# Quick auto-fix for pre-commit: eslint --fix staged TS files + typecheck.
# Blocks the commit only on real TypeScript errors — lint issues are autofixed.

set -e
cd "$(git rev-parse --show-toplevel)"

GREEN='\033[0;32m'
RED='\033[0;31m'
NC='\033[0m'

echo "🔧 Running quick auto-fix..."

# Clean macOS metadata files that sneak onto network/external volumes
find . -name '._*' -type f -delete 2>/dev/null || true

# Toolchain paths — hooks run with a minimal PATH
export PATH="/Volumes/Os_Sites/tools/bin:$PATH"
NODE_BIN="$(ls -d "$HOME"/.nvm/versions/node/v24.*/bin "$HOME"/.nvm/versions/node/v22.*/bin 2>/dev/null | sort -V | tail -1)"
[ -n "$NODE_BIN" ] && export PATH="$NODE_BIN:$PATH"

# ESLint --fix on staged TS/TSX files (auto-heal before checking).
# Run the web package's eslint from the repo root — eslint walks up from
# each file to find its nearest config, so one binary covers all packages.
STAGED_TS=$(git diff --cached --name-only --diff-filter=ACM | grep -E '\.(ts|tsx)$' || true)
if [ -n "$STAGED_TS" ] && [ -x settle-web/node_modules/.bin/eslint ]; then
  echo "$STAGED_TS" | xargs ./settle-web/node_modules/.bin/eslint --fix 2>/dev/null || true
  echo "$STAGED_TS" | xargs git add 2>/dev/null || true
fi

HAS_ERRORS=false

# TypeScript check — web + api
for pkg in settle-web settle-api; do
  if [ -x "$pkg/node_modules/.bin/tsc" ]; then
    echo "🔍 Typechecking $pkg..."
    (cd "$pkg" && ./node_modules/.bin/tsc --noEmit 2>&1) | tee "/tmp/settle-tsc-$pkg.log" || true
    if grep -q "error TS" "/tmp/settle-tsc-$pkg.log" 2>/dev/null; then
      echo -e "${RED}❌ TypeScript errors in $pkg${NC}"
      HAS_ERRORS=true
    fi
  fi
done

if [ "$HAS_ERRORS" = true ]; then
  echo -e "${RED}❌ Fix the errors above before committing${NC}"
  exit 1
fi

echo -e "${GREEN}✅ Quick auto-fix passed${NC}"
