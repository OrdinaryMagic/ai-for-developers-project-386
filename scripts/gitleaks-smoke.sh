#!/usr/bin/env bash
# scripts/gitleaks-smoke.sh — verifies gitleaks catches a fake-secret
# at the pre-commit layer. Runnable from any directory.
#
# Exit 0 = gitleaks correctly flagged the fake secret (smoke PASS).
# Exit 1 = gitleaks missed it, or failed for a reason other than
#          "leak found" (smoke FAIL).
#
# Usage:
#   ./scripts/gitleaks-smoke.sh
#
# What it does:
#   - Creates a temp file at repo root with the AWS-docs fake-key fixture.
#   - Stages it.
#   - Runs `gitleaks protect --staged --redact=20 --verbose --no-banner`.
#   - Expects exit code 1 (gitleaks' "leaks found") AND a finding for the
#     `aws-access-token` rule — any other exit code (0 = missed, 127 =
#     binary not found, config error, ...) is a FAIL, not a PASS.
#   - Resets the stage and removes the temp file.
#
# This script WILL NOT COMMIT the fake secret — it operates purely on
# the staging area. The CI layer's verification (gitleaks/gitleaks-action@v2
# scanning commit history) is exercised by pushing to any branch of the
# repo and watching `gh run watch <run-id>`.

set -euo pipefail

ROOT="$(git rev-parse --show-toplevel)"
TMP="$(mktemp "${ROOT}/.gitleaks-smoke-XXXXXX.txt")"
OUT="$(mktemp "${TMPDIR:-/tmp}/gitleaks-smoke-out-XXXXXX.txt")"

cleanup() {
    git -C "${ROOT}" reset HEAD "${TMP}" >/dev/null 2>&1 || true
    rm -f "${TMP}" "${OUT}"
}
trap cleanup EXIT

# gitleaks resolves its config relative to the scanned source and shells out
# to git for the staged diff — both must happen at the repo root, otherwise
# the scan runs against the wrong directory (or finds no git repo at all).
cd "${ROOT}"

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
gitleaks protect --staged --source "${ROOT}" --redact=20 --verbose --no-banner > "${OUT}" 2>&1
EXIT_CODE=$?
set -e
cat "${OUT}"

if [ "${EXIT_CODE}" -eq 0 ]; then
    echo "❌ FAIL: gitleaks did not detect fake-secret (exit 0)." >&2
    exit 1
fi

if [ "${EXIT_CODE}" -ne 1 ]; then
    echo "❌ FAIL: gitleaks exited with ${EXIT_CODE} (expected 1 = leaks found)." >&2
    echo "   Non-1 exit codes mean the scan itself failed (binary missing, bad config) —" >&2
    echo "   that is a broken smoke, not a caught secret." >&2
    exit 1
fi

if ! grep -q "aws-access-token" "${OUT}"; then
    echo "❌ FAIL: gitleaks found something, but not the aws-access-token rule." >&2
    exit 1
fi

echo "✅ PASS: gitleaks detected fake-secret (exit ${EXIT_CODE}, rule aws-access-token)."
