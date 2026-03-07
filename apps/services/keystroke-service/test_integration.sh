#!/bin/bash

# Integration Test Script for Keystroke Service
# Tests the service through the API Gateway

echo "================================================"
echo "Keystroke Service Integration Test"
echo "================================================"

API_GATEWAY="http://localhost"
TOKEN=""

# Colors
GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Test health endpoint (direct to service)
echo -e "\n${YELLOW}1. Testing Service Health (Direct)${NC}"
curl -X GET http://localhost:8002/health
echo ""

# Test through API Gateway (requires JWT)
echo -e "\n${YELLOW}2. Testing Through API Gateway${NC}"
echo "Note: This requires authentication. You need to:"
echo "  1. Login to get a JWT token"
echo "  2. Use that token in the Authorization header"
echo ""

# Test root endpoint
echo -e "\n${YELLOW}3. Testing Root Endpoint${NC}"
curl -X GET http://localhost:8002/
echo ""

# Test enrolled users
echo -e "\n${YELLOW}4. Testing List Enrolled Users${NC}"
curl -X GET http://localhost:8002/api/keystroke/users/enrolled
echo ""

echo -e "\n${GREEN}================================================${NC}"
echo -e "${GREEN}Basic tests complete!${NC}"
echo -e "${GREEN}================================================${NC}"

echo -e "\n${YELLOW}To test full integration:${NC}"
echo "1. Make sure all services are running:"
echo "   cd infra/docker && docker compose up -d"
echo ""
echo "2. Login to get a JWT token:"
echo "   curl -X POST http://localhost/api/auth/login \\"
echo "     -H 'Content-Type: application/json' \\"
echo "     -d '{\"email\":\"user@example.com\",\"password\":\"password\"}'"
echo ""
echo "3. Use the token to access keystroke endpoints:"
echo "   curl -X GET http://localhost/api/keystroke/users/enrolled \\"
echo "     -H 'Authorization: Bearer YOUR_TOKEN_HERE'"
echo ""
