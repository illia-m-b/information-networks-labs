# Lab 5 — Web Application Security Inspection Report

**Project:** Twitter Clone (Symfony 7.4 / FrankenPHP / MySQL 8.4 / Redis / Vue 3)  
**Target Audited:** Local stack (`https://localhost` and internal `http://php`)  
**Date:** 2026-11-21

---

## 1. Scope & Methodology

This security assessment combined **automated static/dynamic tooling** with **manual penetration testing** across the SSR Twig web routes (`/`, `/about`, `/login`, `/registration`, `/p/{userId}`, `/t/{tweetId}`, `/admin`), the Vue 3 SPA (`/app`), Swagger UI (`/api/docs`), and the REST/metrics endpoints (`/api/*`, `/metrics`).

- **Automated tools:**
  - `composer audit` (PHP dependency CVE check)
  - `phpstan analyse` (`phpstan.dist.neon`, level 4)
  - `curl -kIs` HTTP response header inspection
  - OWASP ZAP (`ghcr.io/zaproxy/zaproxy:stable`, ZAP `2.17.0` `zap-baseline.py`) before and after remediation
- **Manual verification:**
  - Broken Object-Level Authorization / IDOR (`POST /api/profiles`)
  - Stored XSS payload injection (`PATCH /api/profiles/{userId}` + `public/js/*`)
  - Role-Based Access Control (`ROLE_USER` vs `ROLE_ADMIN` on `/api/admin/*` and `/metrics`)
  - Information disclosure (`/api/health`, `/metrics`, `APP_DEBUG` config)
  - Rate limiting (`POST /api/tweets` burst test) and CSRF/token-storage architecture review

---

## 2. Automated Security Scan Results

### 2.1 Dependency Audit (`composer audit`)

Running `docker compose exec php composer audit` against the frozen `composer.lock` flagged **57 advisories across 19 packages** (Symfony `7.4.*` components and `twig/twig`):

- **High/Critical highlights:** `twig/twig` (16 advisories including `CVE-2026-46633` critical and `CVE-2026-47732` high in Twig Sandbox), `symfony/http-foundation` (6 advisories including `CVE-2026-108082` high), `symfony/security-http` (7 advisories), `symfony/http-kernel` (2 advisories), `symfony/yaml` (5 advisories), `symfony/mime` (2 advisories), and `symfony/monolog-bridge` (1 high).
- **Risk context & decision:** The Twig Sandbox extension (`twig/twig`) and `PdoAdapter` cache (`symfony/cache`) are not enabled in this application, and per assignment scope constraints (`ZERO OVER-ENGINEERING`), major framework upgrades were not executed. Running patch-level updates within `symfony/*` `7.4.*` and `twig/twig` `3.*` via `composer update` is recommended as a non-breaking follow-up.

### 2.2 Static Analysis & Code Quality

- **PHPStan (level 4):** `0` errors across `197` analyzed files.
- **PHP-CS-Fixer (`--dry-run`):** `0` of `195` files flagged.
- **DOM Sink Scan (`grep -rnE "innerHTML|v-html" public/js/ public/vue/ templates/page/vue_app.html.twig`):** `0` remaining `innerHTML` or `v-html` sinks after remediation.

### 2.3 OWASP ZAP Passive Baseline (Before vs After)

Because Caddy rejects TLS ClientHello probes lacking SNI on `https://localhost` (`tlsv1 alert internal error`), ZAP ran on the internal Compose network against `http://php` (serving the exact same Caddy site block and Symfony application) with bounded spidering (`-m 1 -T 1`, `maxDepth=2`, `maxChildren=10`, sitemap/robots disabled). Both runs completed scanning and wrote full HTML reports (`docs/reports/zap-baseline-before.html` and `docs/reports/zap-baseline-after.html`); `timeout` terminated cleanup at exit code `124` after report generation.

| Metric / Rule ID | Before (`zap-baseline-before.html`) | After (`zap-baseline-after.html`) | Notes |
|---|---|---|---|
| **Summary Counts** | `FAIL: 0 \| WARN: 17 \| PASS: 51` (691 URLs) | `FAIL: 0 \| WARN: 15 \| PASS: 53` (488 URLs) | 3 security header rules moved to PASS |
| **Missing Anti-clickjacking Header (`10020`)** | `WARN-NEW` (x5) | **PASS** | Fixed via `X-Frame-Options: DENY` + `frame-ancestors 'none'` |
| **X-Content-Type-Options Missing (`10021`)** | `WARN-NEW` (x5) | **PASS** | Fixed via `X-Content-Type-Options: nosniff` |
| **CSP Header Not Set (`10038`)** | `WARN-NEW` (x5) | **PASS** | Fixed via `Content-Security-Policy` in `Caddyfile` |
| **CSP `script-src unsafe-eval` (`10055`)** | `PASS` (no CSP) | `WARN-NEW` (x12) | Expected trade-off for Vue 3 ESM runtime template compiler |
| **Cross-Domain JS (`10017`) / Missing SRI (`90003`)** | `WARN-NEW` | `WARN-NEW` | CDN assets on `/`, `/app`, `/api/docs` (Swagger UI & Vue ESM) |
| **Absence of Anti-CSRF Tokens (`10202`)** | `WARN-NEW` (x4) | `WARN-NEW` (x4) | `/login` & `/registration` forms submit JSON via JS + Bearer JWT |
| **`X-Debug-Token` (`10056`) & `/_profiler/*` leaks (`10031`, `10041`, `10044`, `2`)** | `WARN-NEW` | `WARN-NEW` | Dev-only Symfony WebProfiler; disabled in `compose.deploy.yaml` (`APP_ENV=prod`, `APP_DEBUG=0`) |

---

## 3. Vulnerability Findings & Verification (Before vs After)

| # | Severity | Finding & Location | Before Evidence (PoC) | Remediation Applied | After Verification |
|---|---|---|---|---|---|
| 1 | **High** | **Stored XSS via `innerHTML` Sinks** (`public/js/tweet.js:57`, `alert.js:6`, `loading.js:14`) | `PATCH /api/profiles/{id}` accepted `{"name":"<b>XSS</b><img src=x onerror=alert(1)>"}` (`HTTP 200`); `GET /api/tweets/{id}` returned raw HTML injected into `.innerHTML` by `showTweet()`. | Replaced `.innerHTML` in `tweet.js`, `alert.js` (with Bootstrap alert-type allowlist), and `loading.js` with `document.createElement`, `textContent`, `encodeURIComponent`, and `replaceChildren`. | Zero `innerHTML`/`v-html` matches across `public/js/`, `public/vue/`, and `vue_app.html.twig`; `node --check` passed. |
| 2 | **High** | **IDOR / Broken Object-Level Auth** (`CreateProfileController.php`) | User A (`USER_A_JWT`) created a profile for User B's `userId` via `POST /api/profiles` and received `HTTP 201`. | Injected `#[CurrentUser] User $authUser`; threw `AccessDeniedHttpException` if `$authUser->id() !== $request->userId()`. Added `CreateProfileControllerTest`. | User A calling `POST /api/profiles` with User C's `userId` returned **`HTTP 403`**; PHPUnit passed (`205` tests). |
| 3 | **High** | **Production Debug Exposure** (`compose.yaml` vs `compose.deploy.yaml`) | Base `compose.yaml` hardcoded `APP_ENV=dev` and `APP_DEBUG=1` without `compose.prod.yaml` overrides, exposing stack traces and `/_profiler`. | Created `compose.deploy.yaml` setting `APP_ENV: prod`, `APP_DEBUG: "0"`, and required secret variables. | Verified in Phase 4 prod boot: `/api/health` reported `"env":"prod","debug":"0"`. |
| 4 | **Medium** | **Information Disclosure on `/api/health` & `/metrics`** (`HealthCheckController.php`, `security.yaml`) | `GET /api/health` exposed `env`, `debug`, `opcache`, `SERVER_FRANKENPHP_WORKER_CONFIG`; unauthenticated `GET /metrics` returned `HTTP 200` with Prometheus metrics. | Restricted `/api/health` JSON to `{ status, checkedAt }`; added stateless JWT `metrics` firewall and `ROLE_ADMIN` rule on `^/metrics$`. | `/api/health` returns only `{ status, checkedAt }`; `/metrics` returns **`401`** (anon), **`403`** (`ROLE_USER`), **`200`** (`ROLE_ADMIN`). |
| 5 | **Medium** | **Missing Security Headers & CSP** (`frankenphp/Caddyfile`) | `curl -kIs https://localhost/` showed only `permissions-policy: browsing-topics=()` and exposed `server: FrankenPHP Caddy`. | Added `-Server`, `X-Content-Type-Options: nosniff`, `X-Frame-Options: DENY`, `Referrer-Policy`, `Strict-Transport-Security`, and `Content-Security-Policy`. | Confirmed `HTTP 200` and all security headers present on `/`, `/about`, `/app`, and `/api/docs`. |

### 3.1 Verified Existing Security Controls

- **RBAC Enforcement:** Calling `GET /api/admin/stats` with a `ROLE_USER` JWT consistently returned **`HTTP 403`** (`{"error":{"code":"HTTP_ERROR","message":"An error occurred"}}`).
- **Rate Limiting (`Redis`-backed):** Sending 11 rapid `POST /api/tweets` requests (limit: `10 / minute` in `rate_limiter.yaml`) triggered **`HTTP 429`** with `retry-after: 6` on the 10th request.
- **API Regression Suite:** `bash docs/api-smoke.sh https://localhost` passed all 19 end-to-end checks after fixes.

---

## 4. Architectural Trade-Offs & Remaining Hardening Notes

1. **JWT in `localStorage` vs Cookie-Based CSRF:** The frontend stores JWTs in `localStorage` and sends `Authorization: Bearer <token>`. Because browsers do not attach `Authorization` headers automatically on cross-origin requests, the REST API is immune to traditional cookie-based CSRF (explaining why ZAP's `10202` warning on `/login` and `/registration` is a benign finding). The trade-off is that any XSS vulnerability could exfiltrate tokens from `localStorage`. Removing all `innerHTML` sinks and adding CSP directly reduces this risk; a future migration to `HttpOnly; Secure; SameSite=Lax` cookies with CSRF tokens would further isolate tokens from JS.
2. **CSP `'unsafe-inline'` and `'unsafe-eval'`:** Retained deliberately so existing Twig inline bootstrap scripts (`/`, `/api/docs`) and the zero-build Vue 3 ESM runtime template compiler (`/app`) function without errors. Moving inline scripts to static assets with per-request CSP nonces and switching Vue 3 to pre-compiled templates (Vite) would allow tightening `script-src`.
3. **Registration Endpoint Throttling:** `POST /api/registration` and `POST /api/users` currently do not carry `#[RateLimited]`; adding a sliding-window IP limiter would prevent automated account-creation spam.
