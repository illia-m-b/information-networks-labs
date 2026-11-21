#!/usr/bin/env bash
set -euo pipefail

BASE_URL="${1:-https://localhost}"
SKIP_ADMIN_PROMOTE="${SKIP_ADMIN_PROMOTE:-0}"
EMAIL="smoke_$(date +%s)_$RANDOM@example.com"
PASS='Test12345!'

request() {
    local method="$1"
    local path="$2"
    local auth_header="${3:-}"
    local body="${4:-}"
    local raw

    if [[ -n "$auth_header" && -n "$body" ]]; then
        raw=$(curl -ks -w "\n%{http_code}" -X "$method" "${BASE_URL}${path}" \
            -H "Content-Type: application/json" \
            -H "Authorization: Bearer ${auth_header}" \
            -d "$body")
    elif [[ -n "$auth_header" ]]; then
        raw=$(curl -ks -w "\n%{http_code}" -X "$method" "${BASE_URL}${path}" \
            -H "Authorization: Bearer ${auth_header}")
    elif [[ -n "$body" ]]; then
        raw=$(curl -ks -w "\n%{http_code}" -X "$method" "${BASE_URL}${path}" \
            -H "Content-Type: application/json" \
            -d "$body")
    else
        raw=$(curl -ks -w "\n%{http_code}" -X "$method" "${BASE_URL}${path}")
    fi

    HTTP_STATUS="${raw##*$'\n'}"
    HTTP_BODY="${raw%$'\n'*}"
    if [[ "$HTTP_STATUS" == "$raw" ]]; then
        HTTP_BODY=""
    fi
}

assert_status() {
    local expected="$1"
    local label="$2"
    if [[ "$HTTP_STATUS" != "$expected" ]]; then
        echo "[FAIL] ${label}: expected HTTP ${expected}, got HTTP ${HTTP_STATUS}"
        echo "Body: ${HTTP_BODY}"
        exit 1
    fi
    echo "[PASS] ${label} (HTTP ${HTTP_STATUS})"
}

json_field() {
    node -e "const d = JSON.parse(process.argv[1]); console.log(d[process.argv[2]] ?? '');" "$1" "$2"
}

echo "Running API smoke test against ${BASE_URL} (email=${EMAIL})"

request GET "/api/health"
assert_status "200" "GET /api/health"

request GET "/api/openapi.yaml"
assert_status "200" "GET /api/openapi.yaml"
[[ "$HTTP_BODY" == *"openapi: 3.0.3"* ]] || { echo "[FAIL] OpenAPI header missing"; exit 1; }

request GET "/api/docs"
assert_status "200" "GET /api/docs"
[[ "$HTTP_BODY" == *"SwaggerUIBundle"* ]] || { echo "[FAIL] SwaggerUIBundle missing"; exit 1; }

request POST "/api/registration" "" "{\"email\":\"${EMAIL}\",\"password\":\"${PASS}\",\"name\":\"Smoke Tester\",\"bio\":\"Lab 3 API smoke\"}"
assert_status "201" "POST /api/registration"
USER_ID=$(json_field "$HTTP_BODY" "id")

request POST "/api/token" "" "{\"email\":\"${EMAIL}\",\"password\":\"${PASS}\"}"
assert_status "200" "POST /api/token"
USER_JWT=$(json_field "$HTTP_BODY" "token")
REFRESH_TOKEN=$(json_field "$HTTP_BODY" "refresh_token")

request POST "/api/tweets" "" '{"content":"Unauthenticated tweet"}'
assert_status "401" "POST /api/tweets without JWT"

request POST "/api/tweets" "$USER_JWT" '{"content":"Smoke test initial tweet"}'
assert_status "201" "POST /api/tweets"
TWEET_ID=$(json_field "$HTTP_BODY" "tweetId")

request GET "/api/tweets?limit=10&page=1"
assert_status "200" "GET /api/tweets"

request PATCH "/api/tweets/${TWEET_ID}" "$USER_JWT" '{"content":"Smoke test updated tweet"}'
assert_status "200" "PATCH /api/tweets/{tweetId}"

request POST "/api/tweets/${TWEET_ID}/likes/toggle" "$USER_JWT" "{}"
assert_status "200" "POST /api/tweets/{tweetId}/likes/toggle"
LIKED=$(json_field "$HTTP_BODY" "liked")
if [[ "$LIKED" != "true" ]]; then
    echo "[FAIL] Expected liked=true, got ${LIKED}"
    exit 1
fi

request GET "/api/profiles/${USER_ID}"
assert_status "200" "GET /api/profiles/{userId}"

request PATCH "/api/profiles/${USER_ID}" "$USER_JWT" '{"name":"Smoke Updated","bio":"Updated bio"}'
assert_status "200" "PATCH /api/profiles/{userId}"

request GET "/api/admin/stats" "$USER_JWT"
assert_status "403" "GET /api/admin/stats as ROLE_USER"

ACTIVE_JWT="$USER_JWT"
if [[ "$SKIP_ADMIN_PROMOTE" != "1" ]]; then
    docker compose exec -T php php bin/console app:user:promote-admin "$EMAIL" >/dev/null
    request POST "/api/token" "" "{\"email\":\"${EMAIL}\",\"password\":\"${PASS}\"}"
    assert_status "200" "POST /api/token (re-login as ROLE_ADMIN)"
    ACTIVE_JWT=$(json_field "$HTTP_BODY" "token")
    REFRESH_TOKEN=$(json_field "$HTTP_BODY" "refresh_token")

    request GET "/api/admin/stats" "$ACTIVE_JWT"
    assert_status "200" "GET /api/admin/stats as ROLE_ADMIN"

    request DELETE "/api/admin/tweets/${TWEET_ID}" "$ACTIVE_JWT"
    assert_status "204" "DELETE /api/admin/tweets/{tweetId} (liked tweet)"

    request GET "/api/tweets/${TWEET_ID}"
    assert_status "404" "GET /api/tweets/{tweetId} after admin deletion"
fi

request POST "/api/token/refresh" "" "{\"refresh_token\":\"${REFRESH_TOKEN}\"}"
assert_status "200" "POST /api/token/refresh"
REFRESHED_ACCESS=$(json_field "$HTTP_BODY" "token")
NEW_REFRESH=$(json_field "$HTTP_BODY" "refresh_token")
if [[ -n "$NEW_REFRESH" ]]; then
    REFRESH_TOKEN="$NEW_REFRESH"
fi

request DELETE "/api/tokens" "$REFRESHED_ACCESS" "{\"refreshToken\":\"${REFRESH_TOKEN}\"}"
assert_status "204" "DELETE /api/tokens (logout)"

echo "ALL API SMOKE CHECKS PASSED"
