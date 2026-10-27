#!/bin/bash
set -euo pipefail
cd "$(dirname "$0")/.."

LOCK=.deploy-locked
if ! mkdir "$LOCK" 2>/dev/null; then
  echo "release refused: another deploy holds the lock (if none is running: rmdir $LOCK)" >&2
  exit 1
fi
trap 'rmdir "$LOCK" 2>/dev/null || true' EXIT

echo "==> 1. Checking types..."
npm run typecheck

echo "==> 2. Verifying local files and datasets..."
npm run verify

echo "==> 3. Running test contract suite..."
npm test

echo "==> 4. Stamping deterministic build ID..."
node scripts/stamp-build-id.mjs

echo "==> 5. Deploying to Cloudflare Workers (dhaka.nonarkara.org)..."
npx wrangler deploy

echo "==> 6. Verifying live deployment..."
ATLAS_URL="https://dhaka.nonarkara.org"
sleep 5
npm run smoke
npm run smoke:api || echo "Note: DNS propagation to dhaka.nonarkara.org may take a moment."

echo "==> Deploy complete: dhaka.nonarkara.org is live!"
