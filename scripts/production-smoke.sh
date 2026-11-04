#!/usr/bin/env bash
# scripts/production-smoke.sh — post-deploy smoke check against a live base URL.
#
# Run right after `fly deploy`: it proves that the freshly deployed instance
# actually answers on the public address. Run from the repo root:
#
#   scripts/production-smoke.sh                     # default URL from fly.toml
#   scripts/production-smoke.sh https://host:port   # explicit URL
#
# The default base URL is NOT hardcoded here — it is derived from the
# top-level `app` key of `fly.toml` as `https://<app>.fly.dev`, so
# `fly.toml` stays the single source of truth for the canonical address.
#
# Exit codes:
#   0 — every check passed (PASS).
#   1 — at least one check failed (FAIL), or the environment is unusable.
#
# Checks:
#   GET "/"              → 200
#   GET "/health"        → 200 and the body contains "status":"ok"
#   GET "/config"        → 200 and the body is valid JSON
#   GET "/meeting-types" → 200 and the body is a valid JSON array
#
#   Note on "/meeting-types": an EMPTY array [] is expected on a fresh
#   deploy; a NON-empty array is only a WARNING (an instance that already
#   holds data is perfectly normal) and never fails the smoke. A non-array
#   body, invalid JSON or a non-2xx status are FAILs.
#
# Retry loop (safety net): during a rolling deploy the Fly Proxy may briefly
# answer 502 while the machine is being replaced, so every check is retried
# up to SMOKE_RETRIES times with SMOKE_RETRY_DELAY seconds between attempts.
#
# Environment:
#   SMOKE_RETRIES      — attempts per check (default 5)
#   SMOKE_RETRY_DELAY  — seconds between attempts (default 3)
#   SMOKE_CURL_TIMEOUT — per-request timeout in seconds (default 10)
#
#   All three must be non-negative integers (SMOKE_RETRIES and SMOKE_CURL_TIMEOUT
#   must be >= 1). An invalid value aborts the run before any check with a
#   "❌ FAIL: …" message on stderr — never halfway through the retry loop.
#
# Requires: bash, curl, node (node validates JSON — jq may be absent).

set -euo pipefail

SCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd -- "${SCRIPT_DIR}/.." && pwd)"
FLY_TOML="${REPO_ROOT}/fly.toml"

RETRIES="${SMOKE_RETRIES:-5}"
RETRY_DELAY="${SMOKE_RETRY_DELAY:-3}"
CURL_TIMEOUT="${SMOKE_CURL_TIMEOUT:-10}"

TMP_DIR=""
FAILED_CHECKS=()
WARNING_CHECKS=()
CHECKS_TOTAL=0

# Body validator (node). Modes:
#   health — the body must contain "status":"ok"
#   json   — the body must be valid JSON
#   array  — the body must be a valid JSON array (non-empty → warning, exit 2)
NODE_VALIDATOR='import { readFileSync } from "node:fs";

const [mode, file] = process.argv.slice(1);
const raw = readFileSync(file, "utf8");
const compact = raw.replace(/\s+/g, "");

function fail(reason) {
  console.log(reason);
  process.exit(1);
}

if (mode === "none") {
  console.log("200 OK");
  process.exit(0);
}

if (mode === "health") {
  if (compact.includes("\"status\":\"ok\"")) {
    console.log("body contains \"status\":\"ok\"");
    process.exit(0);
  }
  fail("body does not contain \"status\":\"ok\": " + JSON.stringify(raw.slice(0, 200)));
}

if (mode === "json") {
  try {
    JSON.parse(raw);
  } catch (error) {
    fail("body is not valid JSON: " + error.message);
  }
  console.log("body is valid JSON");
  process.exit(0);
}

if (mode === "array") {
  let value;
  try {
    value = JSON.parse(raw);
  } catch (error) {
    fail("body is not valid JSON: " + error.message);
  }
  if (!Array.isArray(value)) {
    fail("body is valid JSON, but not an array");
  }
  if (value.length > 0) {
    console.log(
      "body is a valid JSON array, but NON-empty (" +
        value.length +
        " items) — [] is expected on a fresh deploy",
    );
    process.exit(2);
  }
  console.log("body is a valid JSON array (empty)");
  process.exit(0);
}

fail("unknown validator mode: " + mode);
'

cleanup() {
  if [ -n "${TMP_DIR}" ] && [ -d "${TMP_DIR}" ]; then
    rm -rf "${TMP_DIR}"
  fi
}
trap cleanup EXIT

die() {
  echo "❌ FAIL: $*" >&2
  exit 1
}

# validate_uint <name> <value> <minimum> — значение обязано быть целым числом
# >= minimum. Невалидное значение — понятное сообщение в stderr и non-zero
# exit (с итоговой строкой «❌ FAIL: …»), а не тихий обрыв внутри цикла.
validate_uint() {
  local name="$1"
  local value="$2"
  local minimum="$3"

  case "${value}" in
    '' | *[!0-9]*) die "${name} must be a non-negative integer, got: ${value}" ;;
  esac
  [ "${value}" -ge "${minimum}" ] || die "${name} must be >= ${minimum}, got: ${value}"
}

require_cmd() {
  command -v "$1" >/dev/null 2>&1 || die "required command not found: $1"
}

# Top-level `app` key of fly.toml — the Fly application name.
# The canonical public URL is derived from it: https://<app>.fly.dev
fly_app_name() {
  # The JS source below is intentionally single-quoted: the shell must NOT
  # expand anything inside it — it is JavaScript, not a shell template.
  # shellcheck disable=SC2016
  node --input-type=module -e '
import { readFileSync } from "node:fs";

const [path] = process.argv.slice(1);
let source = "";
try {
  source = readFileSync(path, "utf8");
} catch {
  process.exit(1);
}

for (const raw of source.split("\n")) {
  const line = raw.trim();
  if (line === "") continue;
  // A section header ends the top-level block — `app` is a root key.
  if (line.startsWith("[")) break;
  const match = /^app\s*=\s*"([^"]*)"/.exec(line);
  if (match) {
    process.stdout.write(match[1]);
    process.exit(0);
  }
}

process.exit(1);
' "$1"
}

# validate_body <mode> <file> — exit 0 = valid, 1 = invalid, 2 = valid with warning.
validate_body() {
  node --input-type=module -e "${NODE_VALIDATOR}" "$1" "$2"
}

# join_by <separator> [items...] — human-readable list for the summary.
join_by() {
  local separator="$1"
  shift
  local result=""
  local item
  for item in "$@"; do
    if [ -n "${result}" ]; then
      result="${result}${separator}"
    fi
    result="${result}${item}"
  done
  printf '%s' "${result}"
}

# check_endpoint <path> <validator-mode> <requirement>
# Retries the endpoint up to ${RETRIES} times; returns 0 on success.
check_endpoint() {
  local path="$1"
  local mode="$2"
  local requirement="$3"

  local attempt=0
  local status=""
  local reason=""
  local verdict=0
  local body_file="${TMP_DIR}/body"
  local curl_err_file="${TMP_DIR}/curl.err"

  CHECKS_TOTAL=$((CHECKS_TOTAL + 1))

  while [ "${attempt}" -lt "${RETRIES}" ]; do
    attempt=$((attempt + 1))

    : >"${body_file}"
    : >"${curl_err_file}"

    status="$(curl --silent --show-error --max-time "${CURL_TIMEOUT}" \
      --output "${body_file}" --write-out '%{http_code}' \
      "${BASE_URL}${path}" 2>"${curl_err_file}" || true)"

    if [ "${status}" = "200" ]; then
      if reason="$(validate_body "${mode}" "${body_file}")"; then
        verdict=0
      else
        verdict=$?
      fi

      if [ "${verdict}" -eq 0 ]; then
        printf '  ✅ %s — %s\n' "${path}" "${requirement}"
        return 0
      fi

      if [ "${verdict}" -eq 2 ]; then
        printf '  ⚠️  %s — WARNING: %s\n' "${path}" "${reason}"
        WARNING_CHECKS+=("${path}")
        return 0
      fi
    else
      reason="HTTP ${status:-000}"
      if [ -s "${curl_err_file}" ]; then
        reason="${reason} (curl: $(<"${curl_err_file}"))"
      fi
    fi

    if [ "${attempt}" -lt "${RETRIES}" ]; then
      printf '  ↻ attempt %d/%d failed for %s (%s) — retry in %ss\n' \
        "${attempt}" "${RETRIES}" "${path}" "${reason}" "${RETRY_DELAY}"
      sleep "${RETRY_DELAY}"
    fi
  done

  printf '  ❌ %s — FAILED (attempt %d/%d): %s\n' \
    "${path}" "${attempt}" "${RETRIES}" "${reason}"
  FAILED_CHECKS+=("${path}")
  return 1
}

main() {
  require_cmd curl
  require_cmd node

  # Числовые env-переменные валидируем до цикла проверок: невалидное значение
  # должно давать понятный FAIL, а не падать внутри `sleep`/`curl`.
  validate_uint "SMOKE_RETRIES" "${RETRIES}" 1
  validate_uint "SMOKE_RETRY_DELAY" "${RETRY_DELAY}" 0
  validate_uint "SMOKE_CURL_TIMEOUT" "${CURL_TIMEOUT}" 1

  if [ "$#" -ge 1 ] && [ -n "${1:-}" ]; then
    BASE_URL="${1%/}"
    URL_SOURCE="command-line argument"
  else
    if [ ! -f "${FLY_TOML}" ]; then
      die "cannot find ${FLY_TOML} — pass the base URL explicitly"
    fi
    if ! FLY_APP="$(fly_app_name "${FLY_TOML}")"; then
      die "cannot read the top-level 'app' key from ${FLY_TOML} — pass the base URL explicitly"
    fi
    BASE_URL="https://${FLY_APP}.fly.dev"
    URL_SOURCE="fly.toml (app = \"${FLY_APP}\")"
  fi

  TMP_DIR="$(mktemp -d)"

  echo "→ base URL: ${BASE_URL} (from ${URL_SOURCE})"
  echo "→ checks: 4 endpoints, up to ${RETRIES} attempt(s), ${RETRY_DELAY}s between attempts"

  check_endpoint "/" "none" "200 OK" || true
  check_endpoint "/health" "health" "200 OK, body contains \"status\":\"ok\"" || true
  check_endpoint "/config" "json" "200 OK, body is valid JSON" || true
  check_endpoint "/meeting-types" "array" "200 OK, body is a valid JSON array" || true

  local passed=$((CHECKS_TOTAL - ${#FAILED_CHECKS[@]}))

  if [ "${#FAILED_CHECKS[@]}" -eq 0 ]; then
    printf '✅ PASS: %d/%d checks passed' "${passed}" "${CHECKS_TOTAL}"
    if [ "${#WARNING_CHECKS[@]}" -gt 0 ]; then
      printf ' (%d warning(s): %s)' \
        "${#WARNING_CHECKS[@]}" "$(join_by ", " "${WARNING_CHECKS[@]}")"
    fi
    printf '\n'
    return 0
  fi

  printf '❌ FAIL: %d/%d checks failed: %s\n' \
    "${#FAILED_CHECKS[@]}" "${CHECKS_TOTAL}" "$(join_by ", " "${FAILED_CHECKS[@]}")"
  return 1
}

main "$@"
