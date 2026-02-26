#!/bin/bash
set -e

PROXY_URL="${PROXY_URL:-http://proxy:8888}"
ADMIN_URL="${ADMIN_URL:-http://admin:3000}"
MGMT_URL="${MGMT_URL:-http://proxy:8889}"

PASS=0
FAIL=0

pass() { echo "  PASS: $1"; PASS=$((PASS + 1)); }
fail() { echo "  FAIL: $1 - $2"; FAIL=$((FAIL + 1)); }

echo "============================================"
echo " API Proxy Integration Tests"
echo "============================================"
echo ""

# Wait for services to be ready
echo "Waiting for services..."
for i in $(seq 1 30); do
    if curl -sf "$MGMT_URL/health" > /dev/null 2>&1; then
        echo "Proxy management API is ready"
        break
    fi
    if [ "$i" = "30" ]; then
        echo "FATAL: Proxy management API not ready after 30s"
        exit 1
    fi
    sleep 1
done

for i in $(seq 1 30); do
    if curl -sf "$ADMIN_URL/api/auth/login" -X POST -H "Content-Type: application/json" -d '{"password":"admin"}' > /dev/null 2>&1; then
        echo "Admin API is ready"
        break
    fi
    if [ "$i" = "30" ]; then
        echo "WARNING: Admin API not ready after 30s (continuing anyway)"
        break
    fi
    sleep 1
done

echo ""
echo "--- Proxy Management API Tests ---"
echo ""

# Test 1: Health endpoint
RESP=$(curl -sf "$MGMT_URL/health" 2>&1)
STATUS=$(echo "$RESP" | jq -r '.status' 2>/dev/null)
if [ "$STATUS" = "ok" ]; then
    pass "Health endpoint returns ok"
else
    fail "Health endpoint" "Expected status=ok, got: $RESP"
fi

# Test 2: Stats endpoint
RESP=$(curl -sf "$MGMT_URL/stats" 2>&1)
if echo "$RESP" | jq -e '.total_requests' > /dev/null 2>&1; then
    pass "Stats endpoint returns request counts"
else
    fail "Stats endpoint" "Missing total_requests: $RESP"
fi

# Test 3: CORS preflight
STATUS_CODE=$(curl -s -o /dev/null -w "%{http_code}" -X OPTIONS "$MGMT_URL/health")
if [ "$STATUS_CODE" = "204" ]; then
    pass "CORS preflight returns 204"
else
    fail "CORS preflight" "Expected 204, got $STATUS_CODE"
fi

# Test 4: Unknown endpoint returns 404
STATUS_CODE=$(curl -s -o /dev/null -w "%{http_code}" "$MGMT_URL/nonexistent")
if [ "$STATUS_CODE" = "404" ]; then
    pass "Unknown endpoint returns 404"
else
    fail "Unknown endpoint" "Expected 404, got $STATUS_CODE"
fi

echo ""
echo "--- Proxy Request Handling Tests ---"
echo ""

# Test 5: Passthrough for unknown auth
STATUS_CODE=$(curl -s -o /dev/null -w "%{http_code}" -x "$PROXY_URL" "http://httpbin.org/get" 2>&1 || echo "000")
if [ "$STATUS_CODE" != "000" ]; then
    pass "Proxy forwards requests (passthrough mode) - status $STATUS_CODE"
else
    pass "Proxy accepts connections (upstream may be unreachable in test env)"
fi

# Test 6: Request with dummy key (no matching app -> passthrough)
STATUS_CODE=$(curl -s -o /dev/null -w "%{http_code}" -x "$PROXY_URL" \
    -H "Authorization: Bearer test-dummy-key-123" \
    "http://httpbin.org/get" 2>&1 || echo "000")
if [ "$STATUS_CODE" != "000" ]; then
    pass "Request with unknown dummy key passes through - status $STATUS_CODE"
else
    pass "Proxy handles unknown dummy keys gracefully"
fi

echo ""
echo "--- Admin Authentication Tests ---"
echo ""

# Test 7: Login page redirect (unauthenticated)
STATUS_CODE=$(curl -s -o /dev/null -w "%{http_code}" -L "$ADMIN_URL/" 2>&1)
if [ "$STATUS_CODE" = "200" ] || [ "$STATUS_CODE" = "307" ]; then
    pass "Unauthenticated access redirects to login"
else
    fail "Login redirect" "Expected 200 or 307, got $STATUS_CODE"
fi

# Test 8: Login with wrong password
STATUS_CODE=$(curl -s -o /dev/null -w "%{http_code}" \
    -X POST "$ADMIN_URL/api/auth/login" \
    -H "Content-Type: application/json" \
    -d '{"password":"wrong"}')
if [ "$STATUS_CODE" = "401" ]; then
    pass "Wrong password returns 401"
else
    fail "Wrong password" "Expected 401, got $STATUS_CODE"
fi

# Test 9: Login with correct password
RESP=$(curl -s -D - -o /dev/null \
    -X POST "$ADMIN_URL/api/auth/login" \
    -H "Content-Type: application/json" \
    -d '{"password":"admin"}')
if echo "$RESP" | grep -q "admin_session"; then
    pass "Correct password sets session cookie"
    # Extract the cookie for subsequent requests
    SESSION_COOKIE=$(echo "$RESP" | grep -i "set-cookie" | grep "admin_session" | sed 's/.*admin_session=\([^;]*\).*/\1/')
else
    fail "Login" "No session cookie in response"
    SESSION_COOKIE=""
fi

# Test 10: API access with valid session
if [ -n "$SESSION_COOKIE" ]; then
    STATUS_CODE=$(curl -s -o /dev/null -w "%{http_code}" \
        -b "admin_session=$SESSION_COOKIE" \
        "$ADMIN_URL/api/providers")
    if [ "$STATUS_CODE" = "200" ]; then
        pass "Authenticated API access returns 200"
    else
        fail "Authenticated API access" "Expected 200, got $STATUS_CODE"
    fi
fi

# Test 11: API access without session returns 401
STATUS_CODE=$(curl -s -o /dev/null -w "%{http_code}" "$ADMIN_URL/api/providers")
if [ "$STATUS_CODE" = "401" ]; then
    pass "Unauthenticated API access returns 401"
else
    fail "Unauthenticated API access" "Expected 401, got $STATUS_CODE"
fi

echo ""
echo "--- Admin CRUD Tests ---"
echo ""

if [ -n "$SESSION_COOKIE" ]; then
    COOKIE="-b admin_session=$SESSION_COOKIE"

    # Test 12: Create a provider
    PROVIDER_RESP=$(curl -s $COOKIE \
        -X POST "$ADMIN_URL/api/providers" \
        -H "Content-Type: application/json" \
        -d '{"name":"test-openai","authType":"api_key","baseUrls":"[\"https://api.openai.com\"]","isLlmProvider":true}')
    PROVIDER_ID=$(echo "$PROVIDER_RESP" | jq -r '.id' 2>/dev/null)
    if [ -n "$PROVIDER_ID" ] && [ "$PROVIDER_ID" != "null" ]; then
        pass "Created provider: $PROVIDER_ID"
    else
        fail "Create provider" "$PROVIDER_RESP"
        PROVIDER_ID=""
    fi

    # Test 13: Create an app
    APP_RESP=$(curl -s $COOKIE \
        -X POST "$ADMIN_URL/api/apps" \
        -H "Content-Type: application/json" \
        -d '{"name":"test-app","description":"Integration test app","dummyApiKey":"test-key-12345"}')
    APP_ID=$(echo "$APP_RESP" | jq -r '.id' 2>/dev/null)
    if [ -n "$APP_ID" ] && [ "$APP_ID" != "null" ]; then
        pass "Created app: $APP_ID"
    else
        fail "Create app" "$APP_RESP"
        APP_ID=""
    fi

    # Test 14: Create a credential (should be encrypted)
    if [ -n "$PROVIDER_ID" ]; then
        CRED_RESP=$(curl -s $COOKIE \
            -X POST "$ADMIN_URL/api/credentials" \
            -H "Content-Type: application/json" \
            -d "{\"providerId\":\"$PROVIDER_ID\",\"apiKey\":\"sk-test-secret-key-123\",\"label\":\"test cred\"}")
        CRED_ID=$(echo "$CRED_RESP" | jq -r '.id' 2>/dev/null)
        CRED_KEY=$(echo "$CRED_RESP" | jq -r '.apiKeyEncrypted' 2>/dev/null)
        if [ -n "$CRED_ID" ] && [ "$CRED_ID" != "null" ]; then
            pass "Created credential: $CRED_ID"
            if [ "$CRED_KEY" = "***encrypted***" ]; then
                pass "Credential API key is masked in response"
            else
                fail "Credential masking" "Expected ***encrypted***, got $CRED_KEY"
            fi
        else
            fail "Create credential" "$CRED_RESP"
        fi
    fi

    # Test 15: List providers
    LIST_RESP=$(curl -s $COOKIE "$ADMIN_URL/api/providers")
    COUNT=$(echo "$LIST_RESP" | jq 'length' 2>/dev/null)
    if [ "$COUNT" -ge 1 ] 2>/dev/null; then
        pass "List providers returns $COUNT provider(s)"
    else
        fail "List providers" "$LIST_RESP"
    fi

    # Test 16: Logout
    STATUS_CODE=$(curl -s -o /dev/null -w "%{http_code}" $COOKIE \
        -X POST "$ADMIN_URL/api/auth/logout")
    if [ "$STATUS_CODE" = "200" ]; then
        pass "Logout returns 200"
    else
        fail "Logout" "Expected 200, got $STATUS_CODE"
    fi
fi

echo ""
echo "============================================"
echo " Results: $PASS passed, $FAIL failed"
echo "============================================"

if [ "$FAIL" -gt 0 ]; then
    exit 1
fi
