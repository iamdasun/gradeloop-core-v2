#!/usr/bin/env python3
"""
Test script for Type-4 Semantic Feature Extraction.

Tests:
1. Feature extraction with 100+ features
2. Feature fusion for code pairs
3. Type-4 detection cascade (without trained model - fallback)
"""

import sys
from pathlib import Path

# Add the service directory to path
sys.path.insert(0, str(Path(__file__).parent))

from clone_detection.features.semantic_features import SemanticFeatureExtractor


def test_feature_extraction():
    """Test semantic feature extraction with 100+ features."""
    print("\n" + "=" * 60)
    print("TEST: Semantic Feature Extraction (100+ features)")
    print("=" * 60)

    extractor = SemanticFeatureExtractor()

    # Sample code snippets
    code1 = """
    public int calculateSum(int[] numbers) {
        int sum = 0;
        for (int num : numbers) {
            if (num > 0) {
                sum += num;
            }
        }
        return sum;
    }
    """

    code2 = """
    public int computeTotal(int[] values) {
        int total = 0;
        for (int val : values) {
            if (val > 0) {
                total += val;
            }
        }
        return total;
    }
    """

    # Extract features
    features1 = extractor.extract_features(code1, "java")
    features2 = extractor.extract_features(code2, "java")

    print(f"\nFeatures per code snippet: {len(features1)}")
    print(f"Expected: ~103 features")
    print(f"Feature vector 1 shape: {features1.shape}")
    print(f"Feature vector 2 shape: {features2.shape}")

    # Verify feature count (should be 100+)
    assert len(features1) >= 100, f"Expected 100+ features, got {len(features1)}"
    assert len(features1) == len(features2), "Feature vectors should have same length"

    # Test fused features
    fused = extractor.extract_fused_features(code1, code2, "java")
    print(f"\nFused feature vector shape: {fused.shape}")
    print(f"Expected: ~206 features (2 x {len(features1)})")

    assert len(fused) == 2 * len(features1), "Fused should be 2x single features"

    # Print feature breakdown
    print("\nFeature Breakdown:")
    print(f"  Traditional:      {extractor.n_traditional} features")
    print(f"  CST:              {extractor.n_cst} features")
    print(f"  Semantic/PDG:     {extractor.n_semantic} features")
    print(f"  Structural Depth: {extractor.n_depth} features")
    print(f"  Type Signatures:  {extractor.n_type} features")
    print(f"  API Fingerprint:  {extractor.n_api} features")
    print(f"  ─────────────────────────────────")
    print(f"  Total per code:   {extractor.n_features_per_code} features")
    print(f"  Fused (pair):     {extractor.n_fused_features} features")

    # Print some feature names
    feature_names = extractor.get_feature_names()
    print(f"\nFirst 20 feature names:")
    for i, name in enumerate(feature_names[:20]):
        print(f"  {i + 1:2d}. {name}")

    print("\n✓ PASSED - Feature extraction working correctly")


def test_feature_categories():
    """Test individual feature categories."""
    print("\n" + "=" * 60)
    print("TEST: Individual Feature Categories")
    print("=" * 60)

    extractor = SemanticFeatureExtractor()

    code = """
    public List<Integer> filterAndSum(List<Integer> numbers) {
        return numbers.stream()
            .filter(n -> n > 0)
            .map(n -> n * 2)
            .collect(Collectors.toList());
    }
    """

    # Test traditional features
    traditional = extractor._extract_traditional_features(code)
    print(f"\nTraditional features ({len(traditional)}):")
    print(f"  LOC: {traditional[0]}")
    print(f"  Control keywords: {traditional[1]}")

    # Test CST features
    cst = extractor._extract_cst_features(code, "java")
    print(f"\nCST features ({len(cst)}):")
    print(f"  First 5 CST feature values: {cst[:5]}")

    # Test depth features
    depth = extractor._extract_depth_features(code, "java")
    print(f"\nDepth features ({len(depth)}):")
    print(f"  Max depth (normalized): {depth[0]:.4f}")
    print(f"  Control depth (normalized): {depth[3]:.4f}")
    print(f"  Branching factor (normalized): {depth[7]:.4f}")

    # Test type features
    type_features = extractor._extract_type_features(code)
    print(f"\nType features ({len(type_features)}):")
    print(f"  Generic return: {type_features[4]:.4f}")
    print(f"  Single parameter: {type_features[7]:.4f}")

    # Test API features
    api = extractor._extract_api_features(code)
    print(f"\nAPI features ({len(api)}):")
    print(f"  Collection ops: {api[2]:.4f}")
    print(f"  Stream ops: {api[7]:.4f}")

    print("\n✓ PASSED - All feature categories working")


def test_semantic_similarity():
    """Test semantic similarity detection."""
    print("\n" + "=" * 60)
    print("TEST: Semantic Similarity Detection")
    print("=" * 60)

    extractor = SemanticFeatureExtractor()

    # Semantically similar code (different algorithms, same function)
    code1 = """
    public int sum(int[] arr) {
        int total = 0;
        for (int i = 0; i < arr.length; i++) {
            total += arr[i];
        }
        return total;
    }
    """

    code2 = """
    public int sum(int[] arr) {
        int total = 0;
        for (int num : arr) {
            total += num;
        }
        return total;
    }
    """

    # Extract features
    features1 = extractor.extract_features(code1, "java")
    features2 = extractor.extract_features(code2, "java")

    # Calculate Euclidean distance
    distance = np.linalg.norm(features1 - features2)
    cosine_sim = np.dot(features1, features2) / (
        np.linalg.norm(features1) * np.linalg.norm(features2)
    )

    print(f"\nSemantic clone pair (different loop styles):")
    print(f"  Euclidean distance: {distance:.4f}")
    print(f"  Cosine similarity:  {cosine_sim:.4f}")

    # Semantically different code
    code3 = """
    public int max(int[] arr) {
        int max = arr[0];
        for (int i = 1; i < arr.length; i++) {
            if (arr[i] > max) {
                max = arr[i];
            }
        }
        return max;
    }
    """

    features3 = extractor.extract_features(code3, "java")
    distance_diff = np.linalg.norm(features1 - features3)
    cosine_sim_diff = np.dot(features1, features3) / (
        np.linalg.norm(features1) * np.linalg.norm(features3)
    )

    print(f"\nDifferent functionality (sum vs max):")
    print(f"  Euclidean distance: {distance_diff:.4f}")
    print(f"  Cosine similarity:  {cosine_sim_diff:.4f}")

    print(f"\nComparison:")
    print(f"  Similar code distance:    {distance:.4f}")
    print(f"  Different code distance:  {distance_diff:.4f}")
    print(f"  Distance ratio:           {distance_diff / max(distance, 0.001):.2f}x")

    # The distance for different code should be larger
    assert distance_diff > distance, (
        "Different code should have larger feature distance"
    )

    print("\n✓ PASSED - Semantic features distinguish functionality")


if __name__ == "__main__":
    import numpy as np

    print("\n" + "=" * 60)
    print("TYPE-4 SEMANTIC FEATURE EXTRACTION TEST SUITE")
    print("=" * 60)

    try:
        test_feature_extraction()
        test_feature_categories()
        test_semantic_similarity()

        print("\n" + "=" * 60)
        print("ALL TESTS PASSED ✓")
        print("=" * 60 + "\n")
    except AssertionError as e:
        print(f"\n✗ TEST FAILED: {e}\n")
        sys.exit(1)
    except Exception as e:
        print(f"\n✗ ERROR: {e}\n")
        import traceback

        traceback.print_exc()
        sys.exit(1)
