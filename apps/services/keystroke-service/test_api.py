"""
Test script for Keystroke Authentication Service
Tests the API endpoints locally
"""

import requests
import json
from typing import Dict, List

BASE_URL = "http://localhost:8080"

def print_response(response):
    """Pretty print API response"""
    print(f"Status: {response.status_code}")
    try:
        print(f"Response: {json.dumps(response.json(), indent=2)}")
    except:
        print(f"Response: {response.text}")
    print("-" * 80)

def test_health():
    """Test health check endpoint"""
    print("\n🔍 Testing Health Check...")
    response = requests.get(f"{BASE_URL}/health")
    print_response(response)
    return response.status_code == 200

def test_root():
    """Test root endpoint"""
    print("\n🔍 Testing Root Endpoint...")
    response = requests.get(f"{BASE_URL}/")
    print_response(response)
    return response.status_code == 200

def generate_sample_keystrokes(count: int = 200, user_id: str = "test_user") -> List[Dict]:
    """Generate sample keystroke events for testing"""
    import time
    
    text = "Hello, this is a test of the keystroke authentication system. We need enough data for enrollment."
    events = []
    base_time = int(time.time() * 1000)
    
    for i, char in enumerate(text * (count // len(text) + 1))[:count]:
        if i >= count:
            break
            
        event = {
            "userId": user_id,
            "sessionId": f"test_session_{int(time.time())}",
            "timestamp": base_time + (i * 150) + (i % 50),  # Simulate realistic timing
            "key": char,
            "dwellTime": 80 + (i % 30),  # 80-110ms dwell time
            "flightTime": 50 + (i % 40),  # 50-90ms flight time
            "keyCode": ord(char) if len(char) == 1 else 32
        }
        events.append(event)
    
    return events

def test_enroll():
    """Test user enrollment"""
    print("\n🔍 Testing User Enrollment...")
    
    # Generate sample keystrokes (need at least 150 for enrollment)
    keystrokes = generate_sample_keystrokes(200, "alice")
    
    payload = {
        "userId": "alice",
        "keystrokeEvents": keystrokes
    }
    
    response = requests.post(f"{BASE_URL}/api/keystroke/enroll", json=payload)
    print_response(response)
    return response.status_code == 200

def test_verify():
    """Test user verification"""
    print("\n🔍 Testing User Verification...")
    
    # Generate sample keystrokes for verification (need at least 70)
    keystrokes = generate_sample_keystrokes(100, "alice")
    
    payload = {
        "userId": "alice",
        "keystrokeEvents": keystrokes,
        "threshold": 0.7
    }
    
    response = requests.post(f"{BASE_URL}/api/keystroke/verify", json=payload)
    print_response(response)
    return response.status_code == 200

def test_list_enrolled():
    """Test listing enrolled users"""
    print("\n🔍 Testing List Enrolled Users...")
    response = requests.get(f"{BASE_URL}/api/keystroke/users/enrolled")
    print_response(response)
    return response.status_code == 200

def test_capture():
    """Test keystroke capture"""
    print("\n🔍 Testing Keystroke Capture...")
    
    keystrokes = generate_sample_keystrokes(50, "bob")
    
    payload = {
        "events": keystrokes
    }
    
    response = requests.post(f"{BASE_URL}/api/keystroke/capture", json=payload)
    print_response(response)
    return response.status_code == 200

def run_all_tests():
    """Run all tests"""
    print("=" * 80)
    print("🚀 Keystroke Authentication Service - API Tests")
    print("=" * 80)
    
    tests = [
        ("Health Check", test_health),
        ("Root Endpoint", test_root),
        ("List Enrolled Users", test_list_enrolled),
        ("User Enrollment", test_enroll),
        ("User Verification", test_verify),
        ("Keystroke Capture", test_capture),
    ]
    
    results = {}
    
    for test_name, test_func in tests:
        try:
            results[test_name] = test_func()
        except Exception as e:
            print(f"\n❌ Error in {test_name}: {str(e)}")
            results[test_name] = False
    
    # Print summary
    print("\n" + "=" * 80)
    print("📊 Test Summary")
    print("=" * 80)
    
    for test_name, passed in results.items():
        status = "✅ PASS" if passed else "❌ FAIL"
        print(f"{status} - {test_name}")
    
    total = len(results)
    passed = sum(1 for v in results.values() if v)
    print(f"\nTotal: {passed}/{total} tests passed")
    print("=" * 80)

if __name__ == "__main__":
    print("\n⚠️  Make sure the service is running on http://localhost:8080")
    print("   Start it with: python main.py\n")
    
    try:
        run_all_tests()
    except requests.exceptions.ConnectionError:
        print("\n❌ ERROR: Could not connect to the service.")
        print("   Please make sure the service is running on http://localhost:8080")
        print("   Start it with: python main.py")
