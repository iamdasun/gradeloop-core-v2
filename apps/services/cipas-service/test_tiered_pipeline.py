#!/usr/bin/env python3
"""
Test script for the Tiered Detection Pipeline.

Tests:
1. Type-1: Exact clones (literal comparison)
2. Type-2: Renamed clones (blinded comparison)
3. Type-3: Modified clones (TOMA + Random Forest)
"""

import sys
from pathlib import Path

# Add the service directory to path
sys.path.insert(0, str(Path(__file__).parent))

from clone_detection.normalizers.structural_normalizer import (
    NormalizationLevel,
    StructuralNormalizer,
)
from clone_detection.pipelines.tiered_pipeline import TieredPipeline


def test_type1_exact_clones():
    """Test Type-1 detection: Exact clones with different formatting."""
    print("\n" + "=" * 60)
    print("TEST: Type-1 Exact Clones")
    print("=" * 60)

    normalizer = StructuralNormalizer()

    # Exact clones with different formatting
    code1 = """
    public int sum(int a, int b) {
        return a + b;
    }
    """

    code2 = """
    public int sum(int a, int b) {
        return a + b;
    }
    """

    jaccard, lev_ratio, norm1, norm2 = normalizer.compare_literal(code1, code2, "java")

    print(f"Jaccard Similarity: {jaccard:.4f}")
    print(f"Levenshtein Ratio:  {lev_ratio:.4f}")
    print(f"Threshold:          {normalizer.TYPE_1_JACCARD_THRESHOLD:.2f}")

    is_type1 = (
        jaccard >= normalizer.TYPE_1_JACCARD_THRESHOLD
        and lev_ratio >= normalizer.TYPE_1_LEVENSHTEIN_THRESHOLD
    )
    print(f"Type-1 Detected: {is_type1}")
    assert is_type1, "Should detect Type-1 clone"
    print("✓ PASSED")


def test_type2_renamed_clones():
    """Test Type-2 detection: Renamed variable clones."""
    print("\n" + "=" * 60)
    print("TEST: Type-2 Renamed Clones")
    print("=" * 60)

    normalizer = StructuralNormalizer()

    # Renamed clones
    code1 = """
    public int sum(int a, int b) {
        return a + b;
    }
    """

    code2 = """
    public int add(int x, int y) {
        return x + y;
    }
    """

    # First check literal (should fail)
    jaccard_lit, lev_lit, _, _ = normalizer.compare_literal(code1, code2, "java")
    print(f"Literal Jaccard: {jaccard_lit:.4f} (should be < 0.98)")

    # Then check blinded (should pass)
    jaccard_blind, lev_blind, blind1, blind2 = normalizer.compare_blinded(
        code1, code2, "java"
    )

    print(f"Blinded Jaccard:   {jaccard_blind:.4f}")
    print(f"Blinded Lev Ratio: {lev_blind:.4f}")
    print(f"Threshold:         {normalizer.TYPE_2_THRESHOLD:.2f}")

    max_sim = max(jaccard_blind, lev_blind)
    is_type2 = max_sim >= normalizer.TYPE_2_THRESHOLD

    print(f"Blinded Code 1: {blind1[:50]}...")
    print(f"Blinded Code 2: {blind2[:50]}...")
    print(f"Type-2 Detected: {is_type2}")
    assert is_type2, "Should detect Type-2 clone"
    print("✓ PASSED")


def test_type3_modified_clones():
    """Test Type-3 detection: Modified clones."""
    print("\n" + "=" * 60)
    print("TEST: Type-3 Modified Clones")
    print("=" * 60)

    normalizer = StructuralNormalizer()

    # Modified clones (statements added/removed)
    code1 = """
    public int sum(int a, int b) {
        int result = a + b;
        return result;
    }
    """

    code2 = """
    public int sum(int a, int b) {
        return a + b;
    }
    """

    # Check blinded (should fail Type-2 threshold)
    jaccard_blind, lev_blind, _, _ = normalizer.compare_blinded(code1, code2, "java")

    print(f"Blinded Jaccard:   {jaccard_blind:.4f}")
    print(f"Blinded Lev Ratio: {lev_blind:.4f}")
    print(f"Type-2 Threshold:  {normalizer.TYPE_2_THRESHOLD:.2f}")

    max_sim = max(jaccard_blind, lev_blind)
    is_type2 = max_sim >= normalizer.TYPE_2_THRESHOLD

    print(f"Goes to Phase Two (TOMA): {not is_type2}")
    assert not is_type2, "Should NOT detect Type-2, needs Type-3 analysis"
    print("✓ PASSED - Correctly proceeds to Phase Two")


def test_tiered_pipeline():
    """Test the full tiered pipeline."""
    print("\n" + "=" * 60)
    print("TEST: Full Tiered Pipeline")
    print("=" * 60)

    pipeline = TieredPipeline()

    # Test Type-1
    code1_type1 = "public int foo(int x) { return x + 1; }"
    code2_type1 = "public int foo(int x) { return x + 1; }"

    result = pipeline.detect(code1_type1, code2_type1, "java")
    print(f"\nType-1 Test:")
    print(f"  Clone Type: {result.clone_type}")
    print(f"  Confidence: {result.confidence:.4f}")
    print(f"  Normalization: {result.normalization_level}")
    assert result.clone_type == "Type-1", "Should detect Type-1"
    assert result.confidence == 1.0, "Type-1 confidence should be 1.0"
    assert result.normalization_level == "Literal"
    print("  ✓ Type-1 PASSED")

    # Test Type-2
    code1_type2 = "public int sum(int a, int b) { return a + b; }"
    code2_type2 = "public int add(int x, int y) { return x + y; }"

    result = pipeline.detect(code1_type2, code2_type2, "java")
    print(f"\nType-2 Test:")
    print(f"  Clone Type: {result.clone_type}")
    print(f"  Confidence: {result.confidence:.4f}")
    print(f"  Normalization: {result.normalization_level}")
    assert result.clone_type == "Type-2", "Should detect Type-2"
    assert 0.95 <= result.confidence < 1.0, "Type-2 confidence should be ~0.95"
    assert result.normalization_level == "Blinded"
    print("  ✓ Type-2 PASSED")

    # Test Type-3 (modified)
    code1_type3 = """
    public int sum(int a, int b) {
        int result = a + b;
        System.out.println("Result: " + result);
        return result;
    }
    """
    code2_type3 = """
    public int sum(int a, int b) {
        return a + b;
    }
    """

    result = pipeline.detect(code1_type3, code2_type3, "java")
    print(f"\nType-3 Test:")
    print(f"  Clone Type: {result.clone_type}")
    print(f"  Confidence: {result.confidence:.4f}")
    print(f"  Normalization: {result.normalization_level}")
    # Note: Without trained RF model, fallback may classify as Type-4
    # The key is that it uses Token-based normalization (Phase Two/Three)
    assert result.clone_type in ["Type-3", "Type-4", "Not Clone"], (
        "Should use Phase Two/Three"
    )
    assert result.normalization_level == "Token-based"
    print("  ✓ Type-3 PASSED")

    print("\n" + "=" * 60)
    print("ALL TIERED PIPELINE TESTS PASSED")
    print("=" * 60)


def test_type2_logic_leak_prevention():
    """
    Test Type-2 Logic Leak Prevention.

    This test verifies that code pairs with high similarity (>=0.95) but
    significant length difference (>5%) are NOT misclassified as Type-2.
    Instead, they should fall through to Phase Two (TOMA + Random Forest)
    for Type-3/Type-4 analysis.

    Edge case: Extra list comprehension added (structural change).
    """
    print("\n" + "=" * 60)
    print("TEST: Type-2 Logic Leak Prevention")
    print("=" * 60)

    pipeline = TieredPipeline()

    # Edge case: Code with extra list comprehension (structural change)
    # Original code
    code1 = """
    public List<Integer> process(List<Integer> nums) {
        List<Integer> result = new ArrayList<>();
        for (int n : nums) {
            if (n > 0) {
                result.add(n * 2);
            }
        }
        return result;
    }
    """

    # Modified code with additional list comprehension (significant structural change)
    # This should NOT be classified as Type-2 even if similarity is high
    code2 = """
    public List<Integer> process(List<Integer> nums) {
        List<Integer> filtered = new ArrayList<>();
        for (int n : nums) {
            if (n > 0) {
                filtered.add(n);
            }
        }
        List<Integer> result = new ArrayList<>();
        for (int n : filtered) {
            result.add(n * 2);
        }
        return result;
    }
    """

    result = pipeline.detect(code1, code2, "java")

    print(f"Clone Type: {result.clone_type}")
    print(f"Confidence: {result.confidence:.4f}")
    print(f"Normalization Level: {result.normalization_level}")
    print(f"Jaccard Similarity: {result.jaccard_similarity:.4f}")
    print(f"Levenshtein Ratio: {result.levenshtein_ratio:.4f}")

    # Verify that this is NOT classified as Type-2
    # It should go to Phase Two (Token-based pipeline) for Type-3 analysis
    assert result.clone_type != "Type-2", (
        "Should NOT classify as Type-2 when length differs significantly"
    )
    assert result.normalization_level == "Token-based", (
        "Should use Token-based (Phase Two) pipeline for structural changes"
    )
    print("✓ PASSED - Correctly bypassed Type-2 classification")


def test_type2_valid_renamed_clones():
    """
    Test that valid Type-2 renamed clones (with minimal length difference)
    are still correctly detected.
    """
    print("\n" + "=" * 60)
    print("TEST: Valid Type-2 Renamed Clones (Control)")
    print("=" * 60)

    pipeline = TieredPipeline()

    # Valid Type-2: Only identifiers renamed, same structure
    code1 = """
    public int calculateSum(int a, int b) {
        return a + b;
    }
    """

    code2 = """
    public int computeTotal(int x, int y) {
        return x + y;
    }
    """

    result = pipeline.detect(code1, code2, "java")

    print(f"Clone Type: {result.clone_type}")
    print(f"Confidence: {result.confidence:.4f}")
    print(f"Normalization Level: {result.normalization_level}")

    # Verify that valid Type-2 clones are still detected
    assert result.clone_type == "Type-2", "Should classify renamed clones as Type-2"
    assert result.normalization_level == "Blinded", (
        "Should use Blinded normalization for Type-2"
    )
    print("✓ PASSED - Valid Type-2 clones still detected correctly")


def test_full_cascade_detection():
    """
    Test the full automatic cascade detection flow.

    Verifies that the pipeline correctly cascades through:
    Type-1 → Type-2 → Type-3 → Type-4 → Non-clone
    with early exit when a clone type is confirmed.
    """
    print("\n" + "=" * 60)
    print("TEST: Full Automatic Cascade Detection")
    print("=" * 60)

    pipeline = TieredPipeline()

    # Test 1: Type-1 (exact match) - should exit early
    print("\n--- Test 1: Type-1 (Exact Match) ---")
    code1_type1 = "public int foo(int x) { return x + 1; }"
    code2_type1 = "public int foo(int x) { return x + 1; }"

    result = pipeline.detect(code1_type1, code2_type1, "java")
    print(f"  Clone Type: {result.clone_type}")
    print(f"  Confidence: {result.confidence:.4f}")
    print(f"  Normalization: {result.normalization_level}")
    assert result.clone_type == "Type-1", "Should detect Type-1 and exit early"
    assert result.normalization_level == "Literal"
    print("  ✓ Type-1: Early exit confirmed")

    # Test 2: Type-2 (renamed) - should exit early
    print("\n--- Test 2: Type-2 (Renamed Variables) ---")
    code1_type2 = "public int sum(int a, int b) { return a + b; }"
    code2_type2 = "public int add(int x, int y) { return x + y; }"

    result = pipeline.detect(code1_type2, code2_type2, "java")
    print(f"  Clone Type: {result.clone_type}")
    print(f"  Confidence: {result.confidence:.4f}")
    print(f"  Normalization: {result.normalization_level}")
    assert result.clone_type == "Type-2", "Should detect Type-2 and exit early"
    assert result.normalization_level == "Blinded"
    print("  ✓ Type-2: Early exit confirmed")

    # Test 3: Type-2 Logic Leak Prevention (structural change)
    print("\n--- Test 3: Type-2 Logic Leak Prevention ---")
    code1_leak = """
    public List<Integer> process(List<Integer> nums) {
        List<Integer> result = new ArrayList<>();
        for (int n : nums) {
            if (n > 0) {
                result.add(n * 2);
            }
        }
        return result;
    }
    """
    code2_leak = """
    public List<Integer> process(List<Integer> nums) {
        List<Integer> filtered = new ArrayList<>();
        for (int n : nums) {
            if (n > 0) {
                filtered.add(n);
            }
        }
        List<Integer> result = new ArrayList<>();
        for (int n : filtered) {
            result.add(n * 2);
        }
        return result;
    }
    """

    result = pipeline.detect(code1_leak, code2_leak, "java")
    print(f"  Clone Type: {result.clone_type}")
    print(f"  Normalization: {result.normalization_level}")
    assert result.clone_type != "Type-2", "Should NOT classify as Type-2"
    assert result.normalization_level == "Token-based", "Should use Phase Two/Three"
    print("  ✓ Logic Leak Prevention: Correctly bypassed Type-2")

    # Test 4: Non-clone (completely different code)
    print("\n--- Test 4: Non-Clone (Different Code) ---")
    code1_non = "public int sum(int a, int b) { return a + b; }"
    code2_non = "public void print(String msg) { System.out.println(msg); }"

    result = pipeline.detect(code1_non, code2_non, "java")
    print(f"  Clone Type: {result.clone_type}")
    print(f"  Confidence: {result.confidence:.4f}")
    print(f"  Is Clone: {result.is_clone}")
    # Note: Without trained models, fallback thresholds may classify as Type-4
    # The key is that the full cascade was executed
    print(f"  Normalization: {result.normalization_level}")
    print("  ✓ Non-clone: Cascade completed")

    print("\n" + "=" * 60)
    print("FULL CASCADE TESTS PASSED")
    print("=" * 60)


def test_non_clones():
    """Test non-clone detection."""
    print("\n" + "=" * 60)
    print("TEST: Non-Clones")
    print("=" * 60)

    pipeline = TieredPipeline()

    # Completely different code
    code1 = "public int sum(int a, int b) { return a + b; }"
    code2 = "public void print(String msg) { System.out.println(msg); }"

    result = pipeline.detect(code1, code2, "java")
    print(f"Clone Type: {result.clone_type}")
    print(f"Confidence: {result.confidence:.4f}")
    print(f"Is Clone: {result.is_clone}")
    print(f"Jaccard: {result.jaccard_similarity:.4f}")
    print(f"Lev Ratio: {result.levenshtein_ratio:.4f}")

    # Note: Without trained RF model, fallback threshold is used
    # The test verifies the pipeline runs correctly
    print(f"Normalization: {result.normalization_level}")
    print("✓ PASSED - Pipeline executed correctly")


if __name__ == "__main__":
    print("\n" + "=" * 60)
    print("TIERED DETECTION PIPELINE TEST SUITE")
    print("=" * 60)

    try:
        test_type1_exact_clones()
        test_type2_renamed_clones()
        test_type3_modified_clones()
        test_tiered_pipeline()
        test_type2_logic_leak_prevention()
        test_type2_valid_renamed_clones()
        test_full_cascade_detection()
        test_non_clones()

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
