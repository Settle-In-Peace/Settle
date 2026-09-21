#!/bin/bash
set -e

cd "$(dirname "$0")/.."

echo "=== Building for Cloudflare Workers (OpenNext) ==="
export COPYFILE_DISABLE=1  # Prevent macOS from creating AppleDouble files

# Pre-clean any existing AppleDouble files from source
find . -name '._*' -not -path './node_modules/*' -type f -delete 2>/dev/null || true

# Start a background process to continuously clean AppleDouble files during build
( while true; do
  find .next -name '._*' -type f -delete 2>/dev/null || true
  find .open-next -name '._*' -type f -delete 2>/dev/null || true
  sleep 2
done ) &
CLEANUP_PID=$!

# Step 1: Build the shared-sdk workspace dependency (must come before web build)
echo "=== Step 1: Build @settle/shared-sdk ==="
cd ..
pnpm --filter @settle/shared-sdk build
cd settle-web

# Step 2: Build the Next.js app (standalone mode, not static export)
# NEXT_PUBLIC_* vars are inlined into the client bundle at build time, so they
# must be overridden here — wrangler vars only apply to the worker runtime and
# cannot change already-bundled client JS. Shell env beats .env/.env.local.
echo "=== Step 2: Next.js build ==="
NEXT_PUBLIC_API_URL="https://api.settleinpeace.com" \
NEXT_PUBLIC_APP_URL="https://settleinpeace.com" \
pnpm build

# Step 3: Clean macOS AppleDouble files created during build
echo "=== Step 3: Cleaning AppleDouble files ==="
find .next -name '._*' -type f -delete 2>/dev/null || true
find . -name '._*' -not -path './node_modules/*' -not -path './.next/*' -type f -delete 2>/dev/null || true

# Step 4: Run OpenNext build
echo "=== Step 4: OpenNext build ==="
node node_modules/@opennextjs/cloudflare/dist/cli/index.js build

# Stop the background cleanup process
kill $CLEANUP_PID 2>/dev/null || true

# Step 5: Final cleanup
echo "=== Step 5: Final cleanup ==="
find .open-next -name '._*' -type f -delete 2>/dev/null || true

echo "=== Cloudflare Workers build complete ==="
echo "Deploy with: pnpm cf:deploy"
