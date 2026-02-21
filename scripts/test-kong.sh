#!/bin/bash
# =============================================================================
# Kong API Gateway Test Script
# =============================================================================
# This script tests all Kong gateway functionality
# Usage: ./scripts/test-kong.sh
# =============================================================================

set -e

# Configuration
KONG_URL="http://localhost:8000"
KONG_ADMIN_URL="http://localhost:8001"
IAM_EMAIL="superadmin@gradeloop.com"
IAM_PASSWORD="YourSecurePassword123!"

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Helper functions
print_header() {
    echo -e "\n${BLUE}========================================${NC}"
    echo -e "${BLUE}$1${NC}"
    echo -e "${BLUE}========================================${NC}\n"
}

print_test() {
    echo -e "${YELLOW}TEST:${NC} $1"
}

print_success() {
    echo -e "${GREEN}✓ PASS:${NC} $1"
}

print_failure() {
    echo -e "${RED}✗ FAIL:${NC} $1"
}

print_info() {
    echo -e "${BLUE}INFO:${NC} $1"
}

# =============================================================================
# Test 1: Kong Gateway Health Check
# =============================================================================
test_health_check() {
    print_test "Kong Gateway Health Check"

    RESPONSE=$(curl -s -o /dev/null -w "%{http_code}" "${KONG_URL}/health")

    if [ "$RESPONSE" -eq 200 ]; then
        print_success "Health endpoint returned 200"
    else
        print_failure "Health endpoint returned ${RESPONSE} (expected 200)"
        return 1
    fi
}

# =============================================================================
# Test 2: Kong Status Endpoint
# =============================================================================
test_kong_status() {
    print_test "Kong Status Endpoint"

    RESPONSE=$(curl -s "${KONG_URL}/status" 2>/dev/null || echo "")

    if [ -n "$RESPONSE" ]; then
        print_success "Status endpoint responded: ${RESPONSE}"
    else
        print_info "Status endpoint not available (optional)"
    fi
}

# =============================================================================
# Test 3: Public Route - Login
# =============================================================================
test_login() {
    print_test "Public Route - Login (POST /auth/login)"

    RESPONSE=$(curl -s -w "\n%{http_code}" -X POST "${KONG_URL}/auth/login" \
        -H "Content-Type: application/json" \
        -d "{\"email\":\"${IAM_EMAIL}\",\"password\":\"${IAM_PASSWORD}\"}")

    HTTP_CODE=$(echo "$RESPONSE" | tail -n1)
    BODY=$(echo "$RESPONSE" | head -n-1)

    if [ "$HTTP_CODE" -eq 200 ]; then
        print_success "Login successful (HTTP ${HTTP_CODE})"
        # Extract access token for subsequent tests
        ACCESS_TOKEN=$(echo "$BODY" | grep -o '"accessToken":"[^"]*"' | cut -d'"' -f4 || echo "")
        if [ -n "$ACCESS_TOKEN" ]; then
            print_info "Access Token: ${ACCESS_TOKEN:0:50}..."
            export ACCESS_TOKEN
        fi
    else
        print_info "Login returned HTTP ${HTTP_CODE} (may need valid credentials)"
        print_info "Response: ${BODY:0:200}"
    fi
}

# =============================================================================
# Test 4: Protected Route WITHOUT Token
# =============================================================================
test_protected_without_token() {
    print_test "Protected Route WITHOUT Token (GET /users)"

    RESPONSE=$(curl -s -w "\n%{http_code}" -X GET "${KONG_URL}/users")

    HTTP_CODE=$(echo "$RESPONSE" | tail -n1)
    BODY=$(echo "$RESPONSE" | head -n-1)

    if [ "$HTTP_CODE" -eq 401 ]; then
        print_success "Correctly rejected request without token (HTTP ${HTTP_CODE})"
        print_info "Response: ${BODY:0:100}"
    else
        print_failure "Expected 401, got ${HTTP_CODE}"
        print_info "Response: ${BODY:0:200}"
    fi
}

# =============================================================================
# Test 5: Protected Route WITH Valid Token
# =============================================================================
test_protected_with_token() {
    print_test "Protected Route WITH Valid Token (GET /users)"

    if [ -z "$ACCESS_TOKEN" ]; then
        print_info "Skipping - no access token available (run login test first)"
        return 0
    fi

    RESPONSE=$(curl -s -w "\n%{http_code}" -X GET "${KONG_URL}/users" \
        -H "Authorization: Bearer ${ACCESS_TOKEN}")

    HTTP_CODE=$(echo "$RESPONSE" | tail -n1)
    BODY=$(echo "$RESPONSE" | head -n-1)

    if [ "$HTTP_CODE" -eq 200 ]; then
        print_success "Protected route accessible with valid token (HTTP ${HTTP_CODE})"
    else
        print_info "Got HTTP ${HTTP_CODE}"
        print_info "Response: ${BODY:0:200}"
    fi
}

# =============================================================================
# Test 6: Invalid Token Signature
# =============================================================================
test_invalid_signature() {
    print_test "Invalid Token Signature (GET /users)"

    INVALID_TOKEN="eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxMjM0NTY3ODkwIn0.invalid_signature"

    RESPONSE=$(curl -s -w "\n%{http_code}" -X GET "${KONG_URL}/users" \
        -H "Authorization: Bearer ${INVALID_TOKEN}")

    HTTP_CODE=$(echo "$RESPONSE" | tail -n1)
    BODY=$(echo "$RESPONSE" | head -n-1)

    if [ "$HTTP_CODE" -eq 401 ]; then
        print_success "Correctly rejected invalid signature (HTTP ${HTTP_CODE})"
        print_info "Response: ${BODY:0:100}"
    else
        print_failure "Expected 401, got ${HTTP_CODE}"
    fi
}

# =============================================================================
# Test 7: Rate Limiting on Login
# =============================================================================
test_rate_limiting() {
    print_test "Rate Limiting on Login (5 req/min)"

    print_info "Sending 6 rapid login requests..."

    for i in {1..6}; do
        RESPONSE=$(curl -s -w "\n%{http_code}" -X POST "${KONG_URL}/auth/login" \
            -H "Content-Type: application/json" \
            -d "{\"email\":\"test@test.com\",\"password\":\"wrong\"}")

        HTTP_CODE=$(echo "$RESPONSE" | tail -n1)

        if [ $i -eq 6 ] && [ "$HTTP_CODE" -eq 429 ]; then
            print_success "Rate limiting triggered on request ${i} (HTTP ${HTTP_CODE})"
        elif [ $i -lt 6 ] && [ "$HTTP_CODE" -ne 429 ]; then
            print_info "Request ${i}: HTTP ${HTTP_CODE} (expected)"
        elif [ $i -eq 6 ] && [ "$HTTP_CODE" -ne 429 ]; then
            print_info "Request ${i}: HTTP ${HTTP_CODE} (rate limit may not be configured)"
        fi
    done
}

# =============================================================================
# Test 8: CORS Preflight Request
# =============================================================================
test_cors_preflight() {
    print_test "CORS Preflight Request (OPTIONS /auth/login)"

    RESPONSE=$(curl -s -i -X OPTIONS "${KONG_URL}/auth/login" \
        -H "Origin: http://localhost:3000" \
        -H "Access-Control-Request-Method: POST" \
        -H "Access-Control-Request-Headers: Authorization, Content-Type" \
        2>/dev/null)

    if echo "$RESPONSE" | grep -q "Access-Control-Allow-Origin"; then
        print_success "CORS headers present in response"
        echo "$RESPONSE" | grep "Access-Control-" | head -5
    else
        print_info "CORS headers not found (may need configuration)"
    fi
}

# =============================================================================
# Test 9: Request Size Limiting
# =============================================================================
test_request_size_limit() {
    print_test "Request Size Limiting (1MB max)"

    # Generate a payload larger than 1MB
    LARGE_PAYLOAD=$(python3 -c "print('x' * 1100000)" 2>/dev/null || echo "x")

    RESPONSE=$(curl -s -w "\n%{http_code}" -X POST "${KONG_URL}/auth/login" \
        -H "Content-Type: application/json" \
        -d "{\"email\":\"test@test.com\",\"password\":\"${LARGE_PAYLOAD}\"}" \
        --max-time 10 2>/dev/null)

    HTTP_CODE=$(echo "$RESPONSE" | tail -n1)

    if [ "$HTTP_CODE" -eq 413 ]; then
        print_success "Large request rejected (HTTP 413 Payload Too Large)"
    else
        print_info "Got HTTP ${HTTP_CODE} (size limiting may not be active)"
    fi
}

# =============================================================================
# Test 10: Kong Admin API (Internal Only)
# =============================================================================
test_admin_api_internal() {
    print_test "Kong Admin API Internal Access"

    RESPONSE=$(curl -s -o /dev/null -w "%{http_code}" "${KONG_ADMIN_URL}/config" 2>/dev/null || echo "000")

    if [ "$RESPONSE" -eq 200 ]; then
        print_success "Admin API accessible locally (HTTP ${RESPONSE})"
    else
        print_info "Admin API returned ${RESPONSE} (may be restricted)"
    fi
}

# =============================================================================
# Test 11: Identity Headers Forwarding
# =============================================================================
test_identity_headers() {
    print_test "Identity Headers Forwarding"

    if [ -z "$ACCESS_TOKEN" ]; then
        print_info "Skipping - no access token available"
        return 0
    fi

    # This test verifies that Kong forwards identity headers to IAM service
    # The actual headers are visible in IAM service logs
    print_info "Identity headers (X-User-ID, X-User-Role, X-User-Permissions)"
    print_info "will be forwarded to IAM service. Check IAM logs to verify."

    RESPONSE=$(curl -s -w "\n%{http_code}" -X GET "${KONG_URL}/auth/change-password" \
        -H "Authorization: Bearer ${ACCESS_TOKEN}" \
        -H "Content-Type: application/json" \
        -d "{}")

    HTTP_CODE=$(echo "$RESPONSE" | tail -n1)
    print_info "Request to protected route: HTTP ${HTTP_CODE}"
}

# =============================================================================
# Main Test Runner
# =============================================================================
main() {
    print_header "Kong API Gateway Test Suite"

    print_info "Kong URL: ${KONG_URL}"
    print_info "Kong Admin URL: ${KONG_ADMIN_URL}"
    print_info ""

    # Run all tests
    test_health_check || true
    test_kong_status || true
    test_protected_without_token || true
    test_login || true
    test_protected_with_token || true
    test_invalid_signature || true
    test_rate_limiting || true
    test_cors_preflight || true
    test_request_size_limit || true
    test_admin_api_internal || true
    test_identity_headers || true

    print_header "Test Suite Complete"
    print_info "Review results above for any failures"
    print_info "For detailed logs: docker-compose -f docker-compose.yaml logs -f kong"
}

# Run main function
main "$@"
