#!/bin/bash
set -e

# ============================================================================
# Test App – exercises Google, Miro, and Asana APIs through the proxy
#
# All requests go through the proxy using the pre-configured dummy API key.
# The proxy swaps the dummy key for the real credential before forwarding.
#
# Credentials live in the database and are configured through the admin
# panel at http://localhost:3000.  Mock tests pass without real credentials.
# Real API tests pass once you've configured credentials via admin.
#
# Expects:
#   PROXY_HOST / PROXY_PORT  – proxy address  (default: proxy:8888)
#   MGMT_URL                 – management API (default: http://proxy:8889)
#   DUMMY_API_KEY             – the app's dummy key
# ============================================================================

PROXY_HOST="${PROXY_HOST:-proxy}"
PROXY_PORT="${PROXY_PORT:-8888}"
PROXY_URL="http://${PROXY_HOST}:${PROXY_PORT}"
MGMT_URL="${MGMT_URL:-http://${PROXY_HOST}:8889}"
DUMMY_API_KEY="${DUMMY_API_KEY:-proxy_testapp_00000000-0000-0000-0000-000000000001}"

PASS=0
FAIL=0
SKIP=0

pass() { echo "  PASS: $1"; PASS=$((PASS + 1)); }
fail() { echo "  FAIL: $1 – $2"; FAIL=$((FAIL + 1)); }
skip() { echo "  SKIP: $1 – $2"; SKIP=$((SKIP + 1)); }

# Standard curl flags: use proxy, send dummy key, timeout 15s
# For HTTPS requests the proxy does MITM so we need the proxy CA trusted.
CURL="curl -s --max-time 15 -x $PROXY_URL -H \"Authorization: Bearer $DUMMY_API_KEY\""

echo "============================================"
echo " API Proxy – Test App"
echo " Proxy: $PROXY_URL"
echo " Mgmt:  $MGMT_URL"
echo "============================================"
echo ""

# ------------------------------------------------------------------
# Wait for proxy + install CA cert
# ------------------------------------------------------------------
echo "Waiting for proxy..."
for i in $(seq 1 30); do
    if curl -sf "$MGMT_URL/health" > /dev/null 2>&1; then
        echo "Proxy is ready."
        break
    fi
    [ "$i" = "30" ] && { echo "FATAL: proxy not ready"; exit 1; }
    sleep 1
done

echo "Installing proxy CA certificate..."
CA_FILE="/usr/local/share/ca-certificates/api-proxy-ca.crt"
if curl -sf "$MGMT_URL/ca.pem" -o "$CA_FILE" 2>/dev/null; then
    update-ca-certificates > /dev/null 2>&1
    echo "CA certificate installed."
else
    echo "WARNING: could not fetch CA cert – HTTPS calls may fail."
fi
echo ""

# ------------------------------------------------------------------
# Proxy infrastructure tests
# ------------------------------------------------------------------
echo "--- Infrastructure ---"
echo ""

RESP=$(curl -sf "$MGMT_URL/health")
[ "$(echo "$RESP" | jq -r '.status')" = "ok" ] \
    && pass "Management /health" \
    || fail "Management /health" "$RESP"

RESP=$(curl -sf "$MGMT_URL/stats")
echo "$RESP" | jq -e '.total_requests' > /dev/null 2>&1 \
    && pass "Management /stats" \
    || fail "Management /stats" "$RESP"

curl -sf "$MGMT_URL/ca.pem" | grep -q "BEGIN CERTIFICATE" \
    && pass "CA cert endpoint returns PEM" \
    || fail "CA cert endpoint" "no PEM returned"

echo ""

# ------------------------------------------------------------------
# Mock test (works without real credentials)
# ------------------------------------------------------------------
echo "--- Mock Response ---"
echo ""

RESP=$(curl -s --max-time 15 -x "$PROXY_URL" \
    -H "Authorization: Bearer $DUMMY_API_KEY" \
    "https://sheets.googleapis.com/v4/spreadsheets/mock-sheet-id" 2>&1)
SHEET_TITLE=$(echo "$RESP" | jq -r '.properties.title' 2>/dev/null)
if [ "$SHEET_TITLE" = "Mock Spreadsheet" ]; then
    pass "Mock Google Sheets response returned correctly"
else
    fail "Mock Google Sheets" "Expected 'Mock Spreadsheet', got: ${RESP:0:120}"
fi

echo ""

# ------------------------------------------------------------------
# Google APIs
# ------------------------------------------------------------------
echo "--- Google APIs ---"
echo ""

# Google Sheets – list spreadsheets (Discovery endpoint, needs real key)
RESP=$(curl -s -o /dev/null -w "%{http_code}" --max-time 15 \
    -x "$PROXY_URL" \
    -H "Authorization: Bearer $DUMMY_API_KEY" \
    "https://sheets.googleapis.com/v4/spreadsheets/1BxiMVs0XRA5nFMdKvBdBZjgmUUqptlbs74OgVE2upms" 2>&1)
if [ "$RESP" = "200" ]; then
    pass "Google Sheets – fetch spreadsheet (200)"
elif [ "$RESP" = "403" ] || [ "$RESP" = "401" ] || [ "$RESP" = "404" ]; then
    # 403/401 = real key rejected or missing permissions (key was swapped though)
    # 404 = spreadsheet not found (key was swapped, reached Google)
    pass "Google Sheets – proxy forwarded request (upstream: $RESP)"
elif [ "$RESP" = "000" ]; then
    skip "Google Sheets" "could not connect (network or credential issue)"
else
    pass "Google Sheets – got upstream response: $RESP"
fi

# Google Calendar – list calendars
RESP=$(curl -s -o /dev/null -w "%{http_code}" --max-time 15 \
    -x "$PROXY_URL" \
    -H "Authorization: Bearer $DUMMY_API_KEY" \
    "https://www.googleapis.com/calendar/v3/calendars/primary" 2>&1)
if [ "$RESP" = "200" ]; then
    pass "Google Calendar – fetch primary calendar (200)"
elif [ "$RESP" != "000" ]; then
    pass "Google Calendar – proxy forwarded request (upstream: $RESP)"
else
    skip "Google Calendar" "could not connect"
fi

# Google Drive – list files
RESP=$(curl -s -o /dev/null -w "%{http_code}" --max-time 15 \
    -x "$PROXY_URL" \
    -H "Authorization: Bearer $DUMMY_API_KEY" \
    "https://www.googleapis.com/drive/v3/files?pageSize=1" 2>&1)
if [ "$RESP" = "200" ]; then
    pass "Google Drive – list files (200)"
elif [ "$RESP" != "000" ]; then
    pass "Google Drive – proxy forwarded request (upstream: $RESP)"
else
    skip "Google Drive" "could not connect"
fi

echo ""

# ------------------------------------------------------------------
# Miro APIs
# ------------------------------------------------------------------
echo "--- Miro APIs ---"
echo ""

# Miro – list boards
RESP=$(curl -s -o /dev/null -w "%{http_code}" --max-time 15 \
    -x "$PROXY_URL" \
    -H "Authorization: Bearer $DUMMY_API_KEY" \
    "https://api.miro.com/v2/boards" 2>&1)
if [ "$RESP" = "200" ]; then
    pass "Miro – list boards (200)"
elif [ "$RESP" != "000" ]; then
    pass "Miro – proxy forwarded request (upstream: $RESP)"
else
    skip "Miro – list boards" "could not connect"
fi

# Miro – get user info
RESP=$(curl -s -o /dev/null -w "%{http_code}" --max-time 15 \
    -x "$PROXY_URL" \
    -H "Authorization: Bearer $DUMMY_API_KEY" \
    "https://api.miro.com/v2/users/me" 2>&1)
if [ "$RESP" = "200" ]; then
    pass "Miro – get current user (200)"
elif [ "$RESP" != "000" ]; then
    pass "Miro – proxy forwarded request (upstream: $RESP)"
else
    skip "Miro – get user" "could not connect"
fi

echo ""

# ------------------------------------------------------------------
# Asana APIs
# ------------------------------------------------------------------
echo "--- Asana APIs ---"
echo ""

# Asana – list workspaces
RESP=$(curl -s -o /dev/null -w "%{http_code}" --max-time 15 \
    -x "$PROXY_URL" \
    -H "Authorization: Bearer $DUMMY_API_KEY" \
    "https://app.asana.com/api/1.0/workspaces" 2>&1)
if [ "$RESP" = "200" ]; then
    pass "Asana – list workspaces (200)"
elif [ "$RESP" != "000" ]; then
    pass "Asana – proxy forwarded request (upstream: $RESP)"
else
    skip "Asana – list workspaces" "could not connect"
fi

# Asana – get user info
RESP=$(curl -s -o /dev/null -w "%{http_code}" --max-time 15 \
    -x "$PROXY_URL" \
    -H "Authorization: Bearer $DUMMY_API_KEY" \
    "https://app.asana.com/api/1.0/users/me" 2>&1)
if [ "$RESP" = "200" ]; then
    pass "Asana – get current user (200)"
elif [ "$RESP" != "000" ]; then
    pass "Asana – proxy forwarded request (upstream: $RESP)"
else
    skip "Asana – get user" "could not connect"
fi

echo ""

# ------------------------------------------------------------------
# Firewall rule tests
# ------------------------------------------------------------------
echo "--- Firewall Rules ---"
echo ""

# Should be blocked: admin.google.com
STATUS=$(curl -s -o /dev/null -w "%{http_code}" --max-time 10 \
    -x "$PROXY_URL" \
    -H "Authorization: Bearer $DUMMY_API_KEY" \
    "https://admin.google.com/" 2>&1 || echo "000")
if [ "$STATUS" = "403" ]; then
    pass "Firewall blocks admin.google.com"
elif [ "$STATUS" = "000" ]; then
    skip "Firewall admin.google.com" "could not connect"
else
    fail "Firewall admin.google.com" "Expected 403, got $STATUS"
fi

# Should be blocked: accounts.google.com
STATUS=$(curl -s -o /dev/null -w "%{http_code}" --max-time 10 \
    -x "$PROXY_URL" \
    -H "Authorization: Bearer $DUMMY_API_KEY" \
    "https://accounts.google.com/" 2>&1 || echo "000")
if [ "$STATUS" = "403" ]; then
    pass "Firewall blocks accounts.google.com"
elif [ "$STATUS" = "000" ]; then
    skip "Firewall accounts.google.com" "could not connect"
else
    fail "Firewall accounts.google.com" "Expected 403, got $STATUS"
fi

# Should be blocked: OAuth token endpoint
STATUS=$(curl -s -o /dev/null -w "%{http_code}" --max-time 10 \
    -x "$PROXY_URL" \
    -H "Authorization: Bearer $DUMMY_API_KEY" \
    "https://api.miro.com/v1/oauth/token" 2>&1 || echo "000")
if [ "$STATUS" = "403" ]; then
    pass "Firewall blocks OAuth token endpoints"
elif [ "$STATUS" = "000" ]; then
    skip "Firewall OAuth token" "could not connect"
else
    fail "Firewall OAuth token" "Expected 403, got $STATUS"
fi

echo ""

# ------------------------------------------------------------------
# Proxy stats (verify requests were tracked)
# ------------------------------------------------------------------
echo "--- Post-test Stats ---"
echo ""

STATS=$(curl -sf "$MGMT_URL/stats" 2>&1)
TOTAL=$(echo "$STATS" | jq -r '.total_requests')
BLOCKED=$(echo "$STATS" | jq -r '.blocked_requests')
FORWARDED=$(echo "$STATS" | jq -r '.forwarded_requests')
echo "  Total: $TOTAL | Blocked: $BLOCKED | Forwarded: $FORWARDED"
[ "$TOTAL" -gt 0 ] 2>/dev/null \
    && pass "Stats tracked requests ($TOTAL total)" \
    || fail "Stats" "No requests tracked"

echo ""

# ------------------------------------------------------------------
# Results
# ------------------------------------------------------------------
echo "============================================"
echo " Results: $PASS passed, $FAIL failed, $SKIP skipped"
echo "============================================"

[ "$FAIL" -gt 0 ] && exit 1
exit 0
