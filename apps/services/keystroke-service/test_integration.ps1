# Integration Test Script for Keystroke Service (PowerShell)
# Tests the service through the API Gateway

Write-Host "================================================" -ForegroundColor Cyan
Write-Host "Keystroke Service Integration Test" -ForegroundColor Cyan
Write-Host "================================================" -ForegroundColor Cyan

$API_GATEWAY = "http://localhost"
$SERVICE_DIRECT = "http://localhost:8002"

# Test 1: Service Health (Direct)
Write-Host "`n1. Testing Service Health (Direct)" -ForegroundColor Yellow
try {
    $response = Invoke-WebRequest -Uri "$SERVICE_DIRECT/health" -Method Get
    Write-Host "Status: $($response.StatusCode)" -ForegroundColor Green
    Write-Host $response.Content
} catch {
    Write-Host "Error: $_" -ForegroundColor Red
}

# Test 2: Root Endpoint
Write-Host "`n2. Testing Root Endpoint" -ForegroundColor Yellow
try {
    $response = Invoke-WebRequest -Uri "$SERVICE_DIRECT/" -Method Get
    Write-Host "Status: $($response.StatusCode)" -ForegroundColor Green
    Write-Host $response.Content
} catch {
    Write-Host "Error: $_" -ForegroundColor Red
}

# Test 3: List Enrolled Users
Write-Host "`n3. Testing List Enrolled Users" -ForegroundColor Yellow
try {
    $response = Invoke-WebRequest -Uri "$SERVICE_DIRECT/api/keystroke/users/enrolled" -Method Get
    Write-Host "Status: $($response.StatusCode)" -ForegroundColor Green
    Write-Host $response.Content
} catch {
    Write-Host "Error: $_" -ForegroundColor Red
}

Write-Host "`n================================================" -ForegroundColor Green
Write-Host "Basic tests complete!" -ForegroundColor Green
Write-Host "================================================" -ForegroundColor Green

Write-Host "`nTo test full integration through API Gateway:" -ForegroundColor Yellow
Write-Host "1. Make sure all services are running:"
Write-Host "   cd infra/docker"
Write-Host "   docker compose up -d"
Write-Host ""
Write-Host "2. Login to get a JWT token:"
Write-Host '   $body = @{email="user@example.com"; password="password"} | ConvertTo-Json'
Write-Host '   $response = Invoke-RestMethod -Uri "http://localhost/api/auth/login" -Method Post -Body $body -ContentType "application/json"'
Write-Host '   $token = $response.token'
Write-Host ""
Write-Host "3. Use the token to access keystroke endpoints:"
Write-Host '   $headers = @{Authorization="Bearer $token"}'
Write-Host '   Invoke-RestMethod -Uri "http://localhost/api/keystroke/users/enrolled" -Headers $headers'
Write-Host ""
