#!/usr/bin/env bash
# scripts/gitleaks-smoke.sh — verifies gitleaks catches a fake-secret
# at the pre-commit layer. Run from repo root.
#
# Exit 0 = gitleaks correctly flagged the fake secret (smoke PASS).
# Exit 1 = gitleaks missed it (smoke FAIL).
#
# Usage:
#   ./scripts/gitleaks-smoke.sh
#
# What it does:
#   - Creates a temp file at repo root with the AWS-docs fake-key fixture.
#   - Stages it.
#   - Runs `gitleaks protect --staged --redact=20 --verbose --no-banner`.
#   - Expects non-zero exit (gitleaks flagged it).
#   - Resets the stage and removes the temp file.
#
# This script WILL NOT COMMIT the fake secret — it operates purely on
# the staging area. The CI layer's verification (gitleaks/gitleaks-action@v2
# scanning commit history) is exercised by push'инг в любую ветку репо
# и наблюдение `gh run watch <run-id>`.

set -euo pipefail

ROOT="$(git rev-parse --show-toplevel)"
TMP="$(mktemp "${ROOT}/.gitleaks-smoke-XXXXXX.txt")"

cleanup() {
    git -C "${ROOT}" reset HEAD "${TMP}" >/dev/null 2>&1 || true
    rm -f "${TMP}"
}
trap cleanup EXIT

echo "→ writing AWS-docs fake-key fixture into ${TMP}"
# Build the fixture string at runtime instead of embedding the literal —
# otherwise `gitleaks detect` on the script itself would flag this very
# file as a leak, and a CI scan would block the smoke-script's own push.
PREFIX="AKIA"
SUFFIX="IOSFODNN7EXAMPLE"
echo "${PREFIX}${SUFFIX}" > "${TMP}"
git -C "${ROOT}" add "${TMP}"

echo "→ running gitleaks protect --staged on fake fixture"
set +e
gitleaks protect --staged --redact=20 --verbose --no-banner
EXIT_CODE=$?
set -e

if [ "${EXIT_CODE}" -eq 0 ]; then
    echo "❌ FAIL: gitleaks did not detect fake-secret (exit 0)." >&2
    exit 1
fi

echo "✅ PASS: gitleaks detected fake-secret (exit ${EXIT_CODE})."
