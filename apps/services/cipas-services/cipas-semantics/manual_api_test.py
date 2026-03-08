#!/usr/bin/env python3
"""
Manual Integration Test for Semantic Clone Detection API

This is an integration test that requires a running API server.
It is NOT run automatically during CI/CD unit testing.

To use this test:
1. Start the API server: uvicorn api.main:app --reload
2. Run this script: python manual_api_test.py

Note: This file is intentionally named to avoid pytest auto-discovery.
"""

import json
import sys

import requests

BASE_URL = "http://localhost:8000/api/v1"


def test_health():
    """Test health check endpoint"""
    print("📊 Testing health endpoint...")
    response = requests.get(f"{BASE_URL}/health")
    print(f"   Status: {response.status_code}")
    print(f"   Response: {json.dumps(response.json(), indent=2)}")
    return response.status_code == 200


def test_model_info():
    """Test model info endpoint"""
    print("\n📊 Testing model info endpoint...")
    response = requests.get(f"{BASE_URL}/model/info")
    print(f"   Status: {response.status_code}")
    print(f"   Response: {json.dumps(response.json(), indent=2)}")
    return response.status_code == 200


def test_detect_clone():
    """Test clone detection endpoint"""
    print("\n📊 Testing clone detection...")

    # Test case 1: Semantic clones (should return is_clone=True)
    response = requests.post(
        f"{BASE_URL}/detect",
        json={
            "code1": "def add(a, b):\n    return a + b",
            "code2": "def sum(a, b):\n    return a + b",
        },
    )
    print(f"   Test 1 (clones) - Status: {response.status_code}")
    result = response.json()
    print(f"   Response: {json.dumps(result, indent=2)}")

    # Test case 2: Non-clones (should return is_clone=False)
    response = requests.post(
        f"{BASE_URL}/detect",
        json={
            "code1": "def add(a, b):\n    return a + b",
            "code2": "def multiply(a, b):\n    return a * b",
        },
    )
    print(f"   Test 2 (non-clones) - Status: {response.status_code}")
    result = response.json()
    print(f"   Response: {json.dumps(result, indent=2)}")

    return True


def test_batch_detection():
    """Test batch detection endpoint"""
    print("\n📊 Testing batch detection...")

    response = requests.post(
        f"{BASE_URL}/detect/batch",
        json={
            "pairs": [
                ["def add(a, b): return a + b", "def sum(a, b): return a + b"],
                ["def mul(a, b): return a * b", "def add(a, b): return a + b"],
                ["x = 1", "y = 2"],
            ]
        },
    )
    print(f"   Status: {response.status_code}")
    result = response.json()
    print(f"   Total pairs: {result['total_pairs']}")
    print(f"   Clones found: {result['clone_count']}")
    print(f"   Response: {json.dumps(result, indent=2)}")

    return response.status_code == 200


def test_similarity():
    """Test similarity score endpoint"""
    print("\n📊 Testing similarity score...")

    response = requests.post(
        f"{BASE_URL}/similarity",
        json={
            "code1": "def add(a, b):\n    return a + b",
            "code2": "def sum(a, b):\n    return a + b",
        },
    )
    print(f"   Status: {response.status_code}")
    result = response.json()
    print(f"   Similarity score: {result['similarity_score']}")

    return response.status_code == 200


def main():
    """Run all tests"""
    print("=" * 60)
    print("Semantic Clone Detection API - Test Suite")
    print("=" * 60)

    tests = [
        ("Health Check", test_health),
        ("Model Info", test_model_info),
        ("Clone Detection", test_detect_clone),
        ("Batch Detection", test_batch_detection),
        ("Similarity Score", test_similarity),
    ]

    results = []
    for name, test_func in tests:
        try:
            success = test_func()
            results.append((name, success))
        except Exception as e:
            print(f"\n❌ {name} failed: {e}")
            results.append((name, False))

    print("\n" + "=" * 60)
    print("Test Results Summary")
    print("=" * 60)

    passed = sum(1 for _, success in results if success)
    total = len(results)

    for name, success in results:
        status = "✅ PASS" if success else "❌ FAIL"
        print(f"{status}: {name}")

    print(f"\nTotal: {passed}/{total} tests passed")

    return 0 if passed == total else 1


if __name__ == "__main__":
    sys.exit(main())
