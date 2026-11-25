#!/bin/bash
set -euo pipefail
cd "$(dirname "$0")/.."

# One authorized writer per release: pushes validate only; manual CI runs have
# workflow concurrency. Local writers also refuse an active manual CI run.
# This repository lock protects local processes, not simultaneous other hosts.
LOCK=.deploy-locked
RELEASE_DIR="${DHAKA_RELEASE_DIR:-.wrangler/releases/$(date -u +%Y%m%dT%H%M%SZ)-$$}"
mkdir -p "$RELEASE_DIR"
RELEASE_DIR="$(cd "$RELEASE_DIR" && pwd)"
RECEIPT="$RELEASE_DIR/receipt.json"
RECEIPT_TOOL=scripts/lib/release-receipt.mjs
node "$RECEIPT_TOOL" init "$RECEIPT"

cleanup() {
  local result=$?
  trap - EXIT
  if ! node "$RECEIPT_TOOL" finish "$RECEIPT" "$result"; then
    if [ "$result" -eq 0 ]; then result=1; fi
  fi
  if [ "${LOCK_OWNED:-false}" = true ]; then rmdir "$LOCK" 2>/dev/null || true; fi
  exit "$result"
}
trap cleanup EXIT
trap 'exit 130' INT
trap 'exit 143' TERM
if ! mkdir "$LOCK" 2>/dev/null; then
  echo "release refused: another deploy holds the lock (if none is running: rmdir $LOCK)" >&2
  exit 1
fi
LOCK_OWNED=true

required() {
  local stage=$1 kind=$2; shift 2
  node "$RECEIPT_TOOL" stage "$RECEIPT" "$stage" "$kind" required "$@"
}
check() {
  local stage=$1 kind=$2; shift 2
  if ! required "$stage" "$kind" "$@"; then FAILURES=$((FAILURES + 1)); fi
}

# Required pre-deploy stages stop immediately; none can upload stale code.
required writer-check coordination node "$RECEIPT_TOOL" writer-check
required types software npm run typecheck
required local-files software npm run verify
required contracts software npm test

# Record the candidate previous version, but never infer storage compatibility
# or automatically roll back correct code because a source is quiet.
node "$RECEIPT_TOOL" stage "$RECEIPT" previous-deployment metadata optional npx wrangler deployments list --json || true
required migrations schema npx wrangler d1 migrations apply dhaka-observations --remote
required stamp software node scripts/stamp-build-id.mjs
required deploy deployment npx wrangler deploy

# Independent checks all run, including after an earlier post-deploy failure.
# Satellite health thresholds and exact-byte checks are never bypassed.
export ATLAS_URL="https://dhaka.nonarkara.org"
export DHAKA_GATE_RESULT_PATH="$RELEASE_DIR/satellite-result.json"
FAILURES=0
check static-entry software npm run smoke
check api software npm run smoke:api
check live-bytes integrity node scripts/verify-live-bytes.mjs
check gibs data node scripts/verify-gibs-live.mjs --api "$ATLAS_URL"
check satellite data npm run verify:satellite
check snapshots integrity node scripts/verify-snapshots-live.mjs
check population integrity node scripts/verify-people-live.mjs
check planning integrity node scripts/verify-planning-live.mjs

if [ "$FAILURES" -gt 0 ]; then
  echo "Release verification failed in $FAILURES stages. Deployed code remains recorded in $RECEIPT." >&2
  exit 1
fi
echo "==> Canonical release checks completed. Consult the receipt for source availability."
