#!/usr/bin/env bash
# scripts/production-smoke.sh — post-deploy smoke check against a live base URL.
#
# Run right after a Railway deploy: it proves that the freshly deployed
# instance actually answers on the public address. Run from the repo root:
#
#   scripts/production-smoke.sh                     # default URL from .railway/production.json
#   scripts/production-smoke.sh https://host:port   # explicit URL
#
# The default base URL is NOT hardcoded here — it is read from the
# `publicUrl` field of `.railway/production.json` (манифест production-окружения),
# so that manifest stays the single source of truth for the canonical address.
# The IaC-конфиг `.railway/railway.ts` намеренно не содержит адреса: Railway
# генерирует `*.up.railway.app` сам и в IaC-файл сгенерированные домены не
# попадают (docs.railway.com/infrastructure-as-code).
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
#   GET "/"              → 200 and content-type is text/html (Accept: text/html)
#   GET "/admin/event-types" → 200 and content-type is text/html (Accept: text/html)
#
#   Note on "/meeting-types": an EMPTY array [] is expected on a fresh
#   deploy; a NON-empty array is only a WARNING (an instance that already
#   holds data is perfectly normal) and never fails the smoke. A non-array
#   body, invalid JSON or a non-2xx status are FAILs.
#
#   Note on the last two checks: the service serves BOTH the API and the
#   built SPA on the same domain (ADR-0006). A browser (Accept: text/html)
#   must get the app shell, not the JSON API — these two checks prove the
#   deployed image really contains the frontend and that client-side routes
#   fall back to the shell instead of 404.
#
# Retry loop (safety net): during a rolling deploy the Railway edge may briefly
# answer 502 while the old replica is drained and the new one is starting, so
# every check is retried up to SMOKE_RETRIES times with SMOKE_RETRY_DELAY
# seconds between attempts.
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
RAILWAY_MANIFEST="${REPO_ROOT}/.railway/production.json"

RETRIES="${SMOKE_RETRIES:-5}"
RETRY_DELAY="${SMOKE_RETRY_DELAY:-3}"
CURL_TIMEOUT="${SMOKE_CURL_TIMEOUT:-10}"

# Заголовок `Accept` браузерной навигации: по нему сервис отдаёт оболочку SPA
# вместо JSON-API (ADR-0006).
BROWSER_ACCEPT="text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8"

TMP_DIR=""
FAILED_CHECKS=()
WARNING_CHECKS=()
CHECKS_TOTAL=0

# Body validator (node). Modes:
#   health — the body must contain "status":"ok"
#   json   — the body must be valid JSON
#   array  — the body must be a valid JSON array (non-empty → warning, exit 2)
#   html   — the response content-type must be text/html (the SPA shell)
NODE_VALIDATOR='import { readFileSync } from "node:fs";

const [mode, file, contentType] = process.argv.slice(1);
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

if (mode === "html") {
  if (!/text\/html/i.test(contentType ?? "")) {
    fail("content-type is not text/html: " + JSON.stringify(contentType ?? ""));
  }
  if (raw.trim() === "") {
    fail("body is empty");
  }
  console.log("content-type is text/html");
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

# Canonical public URL — поле `publicUrl` манифеста окружения
# `.railway/production.json`. Пусто на выходе, если поле не читается.
default_base_url() {
  # The JS source below is intentionally single-quoted: the shell must NOT
  # expand anything inside it — it is JavaScript, not a shell template.
  # shellcheck disable=SC2016
  node --input-type=module -e '
import { readFileSync } from "node:fs";

const [path] = process.argv.slice(1);
let manifest = {};
try {
  manifest = JSON.parse(readFileSync(path, "utf8"));
} catch {
  process.exit(1);
}

const url = typeof manifest.publicUrl === "string" ? manifest.publicUrl.trim() : "";
if (url === "") {
  process.exit(1);
}
process.stdout.write(url);
' "$1"
}

# validate_body <mode> <file> [content-type] — exit 0 = valid, 1 = invalid, 2 = valid with warning.
validate_body() {
  node --input-type=module -e "${NODE_VALIDATOR}" "$1" "$2" "${3:-}"
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

# check_endpoint <path> <validator-mode> <requirement> [accept-header]
# Retries the endpoint up to ${RETRIES} times; returns 0 on success.
#
# Необязательный четвёртый аргумент — значение заголовка `Accept`: для
# UI-проверок он нужен, чтобы запрос выглядел как браузерная навигация
# (`Accept: text/html`), а не как API-клиент.
check_endpoint() {
  local path="$1"
  local mode="$2"
  local requirement="$3"
  local accept="${4:-}"

  local attempt=0
  local status=""
  local http_status=""
  local content_type=""
  local reason=""
  local verdict=0
  local body_file="${TMP_DIR}/body"
  local curl_err_file="${TMP_DIR}/curl.err"
  local -a curl_args

  curl_args=(
    --silent
    --show-error
    --max-time "${CURL_TIMEOUT}"
    --output "${body_file}"
    --write-out '%{http_code} %{content_type}'
  )
  if [ -n "${accept}" ]; then
    curl_args+=(--header "Accept: ${accept}")
  fi

  CHECKS_TOTAL=$((CHECKS_TOTAL + 1))

  while [ "${attempt}" -lt "${RETRIES}" ]; do
    attempt=$((attempt + 1))

    : >"${body_file}"
    : >"${curl_err_file}"

    status="$(curl "${curl_args[@]}" "${BASE_URL}${path}" 2>"${curl_err_file}" || true)"
    http_status="${status%% *}"
    content_type="${status#* }"

    if [ "${http_status}" = "200" ]; then
      if reason="$(validate_body "${mode}" "${body_file}" "${content_type}")"; then
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
      reason="HTTP ${http_status:-000}"
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
    if [ ! -f "${RAILWAY_MANIFEST}" ]; then
      die "cannot find ${RAILWAY_MANIFEST} — pass the base URL explicitly"
    fi
    if ! DEFAULT_URL="$(default_base_url "${RAILWAY_MANIFEST}")"; then
      die "cannot read the 'publicUrl' field from ${RAILWAY_MANIFEST} — pass the base URL explicitly"
    fi
    BASE_URL="${DEFAULT_URL%/}"
    URL_SOURCE=".railway/production.json (publicUrl)"
  fi

  TMP_DIR="$(mktemp -d)"

  echo "→ base URL: ${BASE_URL} (from ${URL_SOURCE})"
  echo "→ checks: 6 endpoints, up to ${RETRIES} attempt(s), ${RETRY_DELAY}s between attempts"

  check_endpoint "/" "none" "200 OK" || true
  check_endpoint "/health" "health" "200 OK, body contains \"status\":\"ok\"" || true
  check_endpoint "/config" "json" "200 OK, body is valid JSON" || true
  check_endpoint "/meeting-types" "array" "200 OK, body is a valid JSON array" || true
  # UI-проверки: тот же сервис отдаёт собранный SPA (ADR-0006).
  check_endpoint "/" "html" "200 OK, content-type is text/html (SPA shell)" "${BROWSER_ACCEPT}" || true
  check_endpoint "/admin/event-types" "html" "200 OK, content-type is text/html (SPA route)" \
    "${BROWSER_ACCEPT}" || true

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
