# Audit repo history for secrets + tooling recommendation (issue #44)

> **Date:** 2026-11-04
> **Issue:** [#44 — Audit repo history for secrets + pick scanning tool](https://github.com/OrdinaryMagic/ai-for-developers-project-386/issues/44)
> **Cart:** [#42 — Dockerize booking-api v1 backend](https://github.com/OrdinaryMagic/ai-for-developers-project-386/issues/42)
> **Research branch:** `research/secret-audit` (throwaway; push-only, no PR)
> **Scan fixture:** `origin/main` @ `7c0eacc` (= local `main` after fast-forward); gitleaks 8.18.4 + manual ripgrep across `git log -p --all`.

---

## 1. Audit summary — **CLEAN (no findings)**

Manual scan and automated scan both report zero matches across the full reachable history of every default `origin/*` branch.

### Methodology

Two independent scans, cross-checked:

1. **Manual rules** (`git log -p --all` piped through ripgrep):
   ```
   BEGIN RSA|BEGIN OPENSSH PRIVATE|
   sk-[A-Za-z0-9]{20,}|              # OpenAI, Anthropic-style
   gh[a-z]_[A-Za-z0-9]{20,}|         # GitHub fine-grained + classic PAT
   xox[baprs]-[A-Za-z0-9-]+|         # Slack
   AKIA[0-9A-Z]{16}|                 # AWS access key ID
   AIza[0-9A-Za-z_-]{35}|            # Google API key
   ya29\.|                            # Google OAuth refresh token
   password\s*=\s*['"][^'"]+['"]|     # generic "password = …"
   api[_-]?key\s*[:=]\s*['"][^'"]+['"]|
   token\s*[:=]\s*['"][^'"]+['"]
   ```
   Follow-ups: `.env`-named files, JWT (`eyJ` prefix), `Authorization: Bearer …`, private-key PEM markers, GCP service-account JSON (`"type": "service_account"`), Algolia/Stripe/GCloud literal names, AWS/GCP env-var names with actual values, generic `private_key`/`client_secret` literals, base64 blobs ≥40 chars (filtered out `integrity`/`sha512` package-lock content and commit SHAs).
2. **Automated scan**: downloaded `gitleaks 8.18.4` Linux x64 binary; ran with default ruleset:
   ```
   gitleaks detect --source . --no-banner --log-opts="--all" --no-color --report-format json
   ```

### Result (both scans)

- **Manual grep**: 0 hits on every regex; 0 hits on `.env`-named file history (`git log --all -- '*.env' …` returns empty for `*.env` / `*.env.*` / `.env` / `.env.*`).
- **`gitleaks detect`**: `INF 37 commits scanned. … no leaks found` (full output below).
- **Per-`origin/*`-branch scan** (via repeated `--log-opts` over each remote ref): no leaks per branch.
- **Working-tree scan** (`--no-git`, every file on disk): no leaks found.

### Sample raw output

```
$ gitleaks detect --source . --no-banner --log-opts="--all" --no-color
2:40AM INF 37 commits scanned.
2:40AM INF scan completed in 35.2ms
2:40AM INF no leaks found

$ gitleaks detect --source . --no-banner --no-git --no-color
2:40AM INF scan completed in 11.9ms
2:40AM INF no leaks found
```

### Notable false-positive-prone candidates (verified clean)

- `dffff61 feat: ga` — the commit referenced in the task brief shows `--stat`: only `.github/workflows/*`, `README.md`, `mise.toml`, `package-lock.json`, `package.json`, `tsconfig.json`. No `.env*`, no credentials, no PEM markers. It is the project-init scaffold commit (the `ga` in the subject is short for "github actions" project bootstrapping, not "Google Analytics" — verified by file list).
- `package-lock.json` `integrity` hashes (`sha512-…`, base64) are intentional and not secrets — gitleaks' default rules correctly ignore them.
- Author email `ordm67@gmail.com` is the repo owner's literal git author; appears only in commit metadata, never in code content.
- All occurrences of the literal string `GITHUB_TOKEN` in repo content are documentation references (e.g., `release-please` config ADR), not actual token values.

### Conclusion

The history is clean. **No remediation ticket needed.** Implementation of a forward-looking scanner is purely preventative ("block the next leak"), not corrective ("clean up this leak").

---

## 2. Recommended tool — **`gitleaks`**

gitleaks (Zachary Rice / `gitleaks/gitleaks`) is the **primary recommendation**:

1. **Free and open-source** — Apache-2.0, no SaaS dependency, no auth/account. Beats `ggshield` (GitGuardian's free tier is freemium SaaS; not aligned with our no-third-party-services stance).
2. **First-class `hk`-compatible pre-commit recipe** — gitleaks ships an official pre-commit hook recipe (`https://github.com/gitleaks/gitleaks/blob/master/.pre-commit-hooks.yaml`). hk can wire this as a custom `step` in `hk.pkl` next to `oxfmt` / `oxlint` / `tsc` / `mise-fmt`. Beats `trufflehog` whose pre-commit recipe is less mature and frequently false-positives on `.env.example` keys + JWT tokens in test fixtures.
3. **First-class GitHub Action** — [`gitleaks/gitleaks-action`](https://github.com/gitleaks/gitleaks-action) is the most-starred secret-scanning Action on GitHub Marketplace (3.5k+ stars at scan time). Our existing CI workflow (`.github/workflows/ci.yml`) already has a `shell` step pattern (`Regenerate OpenAPI and verify it is up-to-date`), so plugging in a binary is mechanical. Beats `detect-secrets` which is pre-commit-only and uses a "baseline file" workflow that *blesses* existing leaks — the opposite of what we want.
4. **Tunable via `.gitleaks.toml`** with allowlist regexes, stopwords, per-rule `\[allowlist\] commits` blocks. Lets us whitelist known-safe strings (commit SHAs, package-lock integrity hashes, test fixture JWTs).
5. **Low false-positive ceiling on TypeScript repos** — default rules don't flag normal `=` separated JS object literals; configurable per-rule entropy thresholds.

`trufflehog` is the runner-up: deeper entropy analysis + verification against live APIs, but those very features create noisy PR-time alerts (every test fixture JWT becomes a finding) and the GitHub Action isn't as polished. Acceptable if we later need detector verification, but not for v1.

`ggshield` and `detect-secrets` are **not recommended**: ggshield is SaaS-tied, detect-secrets is pre-commit-only and uses baselines that mask existing leaks.

---

## 3. Placement — **BOTH (defense in depth)**

Recommend enabling gitleaks in two layers, in this priority order:

### Primary: `pre-commit` hook via `hk.pkl`

Local feedback loop. Catches the leak *before* `git push`. Tightest grip on developer workflow. Cost: ~50 ms per commit on first run; cached after.

```pkl
# hk.pkl — under local linters = new Mapping<String, Step> { ... }
  ["gitleaks"] = new Step {
    check = "npx --yes gitleaks@8.18.4 protect --staged --redact=20 --verbose --no-banner"
    fix = null
    check_diff = null
  }
```

Then append `["gitleaks"]` to the `local linters` reference inside `hooks.pre-commit.steps`. (`npx` resolves the binary ad-hoc; `--staged` scopes to the staged change set; `--redact` keeps findings readable in logs without leaking the secret.]

### Defense-in-depth: GitHub Action in `.github/workflows/ci.yml`

Server-side enforcement. Catches `HK=0 git commit` bypasses (the commitlint docs explicitly mention this flag), branch-pushed leak paths, and force-pushes. Independent of local hook installation.

Add a new step **before** `Regenerate OpenAPI` so the build halts on a leaked secret before doing any unrelated work:

```yaml
# .github/workflows/ci.yml — under jobs.check.steps
      - name: Scan repo for secrets (gitleaks)
        uses: gitleaks/gitleaks-action@v2
        env:
          GITHUB_TOKEN: ${{ secrets.GITHUB_TOKEN }}
        with:
          # Scan every commit on every push (full history mode).
          # Default config lives next to source: .gitleaks.toml at repo root.
          args: >-
            --source .
            --no-banner
            --log-opts="--all"
            --redact=20
```

(On use of the existing `jdx/mise-action@v5` step: gitleaks binary downloads via the official Action, so we don't need to add it to `mise.toml [tools]` unless we also want it for local-only invocations. Keeping it as an Action-only dep keeps `mise install` snappy.

### Acceptable alternative (if pre-commit friction becomes an issue)

**CI-only.** Drop the `pre-commit` step; rely entirely on `gitleaks-action` to block on the server. Cost: secrets can still be pushed (visible in the GitHub UI timestamp), and a follow-up remediation commit is required. Pros: zero dev-loop friction, single source of truth, blocks PR merges without bypassing hooks. Recommend this bridge only if `npx`-based pre-commit proves flaky on Windows runners or causes false-positive complaints on first day.

---

## 4. `.gitleaks.toml` allowlist snippet

Concretely tailored to known-safe strings in this repo:

```toml
# .gitleaks.toml — repo-root config; gitleaks loads this automatically when -s .

title = "booking-api gitleaks config"

# Use a recent default ruleset; let upstream vet the regex list.
# Pin to a specific version for reproducibility.
[extend]
useDefault = true

# --- Repo-wide ignores ---------------------------------------------
# Commit SHAs shown in CHANGELOG.md, AGENTS.md, session manifests, ADR refs.
# These are 7-40 char hex strings that gitleaks' default "generic" rule
# occasionally misfires on inside backtick-quoted code blocks.
[allowlist]
  description = "Allowlists for known-safe strings in booking-api."
  paths = [
    '''^CHANGELOG\.md$''',                   # release-please-generated, never secrets
    '''^docs/agents/sessions/.*\.md$''',     # session manifests reference commit SHAs
    '''^docs/adr/.*\.md$''',                 # ADRs reference commit SHAs
    '''^README\.md$''',
    '''^AGENTS\.md$''',
  ]
  regexes = [
    # Commit SHAs (full 40-hex or short 7-hex) inside backtick codeblocks.
    '''`[0-9a-f]{7,40}`''',
    # package-lock.json integrity hashes (sha512-base64); gitleaks already
    # whitelists these but the explicit rule documents intent for reviewers.
    '''integrity": "sha512-[A-Za-z0-9+/=]+"''',
  ]

# --- Per-rule tightening (false-positive reduction in TypeScript) --
# JWTs in test fixtures under test/ and web/src/**: keep the default regex
# but allowlist file paths so test fixtures don't generate CI noise.
[[rules]]
  id = "jwt-via-test-fixtures"
  description = "Allow JWT-shaped strings in test fixtures."
  # We do NOT redefine the rule body — only attach an allowlist.
  allowlists = [
    { paths = ['''^test/.*\.ts$''', '''^web/src/.*\.(test|spec)\.tsx?$'''] },
  ]
```

Notes for the implementer:

- `paths` regexes in `[allowlist]` use `'''...'''` PKL-conflict-free quoting; raw TOML `'…'` is also valid — the rendered file is plain `.gitleaks.toml`, not PKL.
- The `[[rules]]` block reuses gitleaks' built-in JWT detector id (`generic-api-key` covers most cases by entropy; the `jwt` built-in rule handles explicit `eyJ` prefixes).
- The test-fixture allowlist intentionally **does not** allowlist `test/**/setup.ts` or files committed under `web/src/` (production code); we want test data to be flagged if it ever escapes its fixture boundary.

---

## 5. Caveats — known false-positive categories the team should know about

Even with the allowlist above, these categories are likely to surface on this repo in the next 6 months. Document and pre-bless them so reviewers don't file false-positive PR comments.

1. **`package-lock.json` integrity hashes** — base64-encoded SHA-512 of every npm tarball. Default gitleaks rules correctly stop-word these, but if we ever tighten entropy thresholds (e.g., `--config` with a custom rule), `--max-target-megabytes` may need bumping (default 10 MB; `package-lock.json` is ~200 KB, fine).
2. **JWT tokens in vitest/Playwright fixtures** — `web/src/features/**/__tests__/*.test.tsx` and `test/` may stage fake JWTs (`eyJhbGciOi…`). The `jwt-via-test-fixtures` allowlist covers `test/` and `*.test.tsx`/`*.spec.tsx`; any future JWT-shaped fixture outside these paths will fire.
3. **OpenAPI example values in `spec/*.tsp`** — numeric IDs, ISO timestamps, and the occasional literal email like `"owner@example.com"` (RFC 2606 reserved) are fine; but a real-looking email + a numeric `password` field would falsely resemble credentials. Keep spec example values using RFC 5737 / RFC 2606 reserved ranges + the project's own booking UUID format (see `GLOSSARY.md`).
4. **`web/` generated SDK** — `web/src/api/sdk.ts` is generated from `openapi.yaml` (per AGENTS.md rule #9). Should not contain secrets, but if upstream `openapi.yaml` ever embeds an example credential, it'll be flagged here too. Run `mise run gen:sdk` after correcting the `spec/*.tsp` source.
5. **`web/` build output** — `web/dist/` should be `.gitignore`'d (verify on follow-up audit); un-ignored build artifacts may contain API keys if any service bundle inlines an `import.meta.env.*`. gitleaks scans only **tracked** files by default, so once `dist/` is `.gitignore`'d, it's invisible to the tool. (Already part of `.gitignore` at repo-level: `dist/`. Ensure `web/.gitignore` mirrors it after web-workspace setup.)
6. **VSCode / JetBrains workspace junk** — `.idea/`, `.opencode/`, `.vscode/codium.json` are already in `.gitignore`. A spike of "credentials" in those files won't reach gitleaks.
7. **Git author emails** — `git log --pretty=format:'%ae'` exposes `ordm67@gmail.com`. gitleaks does NOT scan commit metadata by default (only patch content via `--log-opts`), so author emails are safe under default config. Note: switching to a different scanner that ingests author metadata (e.g., `pfff`) could surface PII — flag this if it ever comes up.
8. **`gitleaks-action@v2` upload-artifact SARIF** — the Action uploads SARIF by default to GitHub Code Scanning, which is opt-in. To avoid extra UI noise, set `upload: false` on first adoption; revisit once the team is comfortable triaging findings.
9. **`HK=0 git commit …` bypass** — pre-commit hook is skippable per AGENTS.md rule #2 usage; CI step is not. The defense-in-depth choice is exactly why both layers are recommended.
10. **Speed/UX** — gitleaks is fast (~35 ms / 37 commits in our run), `--staged` mode in pre-commit is a couple of ms on typical commits; if a future `npm install` brings in a giant `vendor.js`, raise `max-target-megabytes` commensurately.

---

## 6. Recommended next actions (for issue #44 implementer)

Listed in the order they should be tackled (not part of this research ticket):

1. **Add `.gitleaks.toml`** at repo root with the snippet from §4. Commit reference: `chore(security): add .gitleaks.toml with allowlist for doc SHAs and test fixtures (#44)`.
2. **Wire pre-commit** in `hk.pkl` per §3. Run `make install` to refresh hook chain. Reference: `chore(security): wire gitleaks into hk pre-commit (#44)`.
3. **Wire CI step** in `.github/workflows/ci.yml` per §3, placed **before** `Regenerate OpenAPI` so the build halts before doing unrelated work. Reference: `chore(ci): add gitleaks scan job (#44)`.
4. Smoke-test by intentionally staging a fake AWS key (`AKIAIOSFODNN7EXAMPLE` is a docs example; or any `sk-…` from `gitleaks` testdata) and verifying both pre-commit and CI reject — then run `git reset` to discard the staged secret and `mkdir .gitleaksignore` baseline if needed for false-positive allowlist overrides.

---

## 7. Reproduction recipe (re-run any of these on demand)

```bash
# From any worktree:
gitleaks detect --source . --no-banner --log-opts="--all" --no-color

# Manual cross-checks:
git log -p --all 2>/dev/null \
  | grep -E "(BEGIN RSA|sk-[A-Za-z0-9]{20,}|gh[a-z]_[A-Za-z0-9]{20,}|\
xox[baprs]-[A-Za-z0-9-]+|AKIA[0-9A-Z]{16}|AIza[0-9A-Za-z_-]{35}|ya29\.|\
-----BEGIN|service_account)" | head -100 || echo "CLEAN"

git log --all --diff-filter=A --name-only -- '*.env' '*\.env.*' '.env' '.env.*' || true
```

---

## 8. Status

- Research notes pushed to `research/secret-audit` branch (no PR).
- Issue **NOT closed** — the implementation (`.gitleaks.toml`, `hk.pkl`, CI step) belongs to a follow-up chore ticket, not to research.
- Cart #42 / issue #44 remain open.
