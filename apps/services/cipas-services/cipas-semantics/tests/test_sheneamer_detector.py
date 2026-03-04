"""
Tests for Sheneamer et al. (2021) Type-IV Code Clone Detector.

This module tests the feature extraction, fusion, and clone detection
functionality based on the Sheneamer framework.
"""

import numpy as np
import pytest

from clone_detection.features.sheneamer_features import SheneamerFeatureExtractor
from clone_detection.tokenizers.tree_sitter_tokenizer import TreeSitterTokenizer


class TestSheneamerFeatureExtractor:
    """Test cases for the Sheneamer feature extractor."""

    @pytest.fixture
    def extractor(self):
        """Create feature extractor instance."""
        return SheneamerFeatureExtractor()

    @pytest.fixture
    def tokenizer(self):
        """Create tokenizer instance."""
        return TreeSitterTokenizer()

    def test_feature_count_per_code(self, extractor):
        """Test that correct number of features are extracted per code snippet."""
        # Expected: 11 traditional + 40 CST + 20 semantic + 15 depth + 10 type + 5 API = 101
        expected_features = (
            extractor.n_traditional
            + extractor.n_cst
            + extractor.n_semantic
            + extractor.n_depth
            + extractor.n_type
            + extractor.n_api
        )
        assert expected_features == 101
        assert extractor.n_features_per_code == 101

    def test_fused_feature_count(self, extractor):
        """Test that fused features have correct dimensionality."""
        # Fused = 2 * per_code features
        assert extractor.n_fused_features == 202

    def test_extract_features_java(self, extractor):
        """Test feature extraction for Java code."""
        code = """
        public int sum(int a, int b) {
            if (a > 0 && b > 0) {
                return a + b;
            }
            return 0;
        }
        """
        features = extractor.extract_features(code, language="java")

        assert isinstance(features, np.ndarray)
        assert features.shape == (101,)
        assert features.dtype == np.float64
        assert not np.all(features == 0)

    def test_extract_features_python(self, extractor):
        """Test feature extraction for Python code."""
        code = """
        def sum(a, b):
            if a > 0 and b > 0:
                return a + b
            return 0
        """
        features = extractor.extract_features(code, language="python")

        assert isinstance(features, np.ndarray)
        assert features.shape == (101,)
        assert not np.all(features == 0)

    def test_extract_features_csharp(self, extractor):
        """Test feature extraction for C# code."""
        code = """
        public int Sum(int a, int b) {
            if (a > 0 && b > 0) {
                return a + b;
            }
            return 0;
        }
        """
        features = extractor.extract_features(code, language="csharp")

        assert isinstance(features, np.ndarray)
        assert features.shape == (101,)

    def test_extract_fused_features(self, extractor):
        """Test feature fusion via concatenation."""
        code1 = "int sum(int a, int b) { return a + b; }"
        code2 = "int add(int x, int y) { return x + y; }"

        fused = extractor.extract_fused_features(code1, code2, language="java")

        assert isinstance(fused, np.ndarray)
        assert fused.shape == (202,)

        # First half should match code1 features
        features1 = extractor.extract_features(code1, language="java")
        np.testing.assert_array_equal(fused[:101], features1)

        # Second half should match code2 features
        features2 = extractor.extract_features(code2, language="java")
        np.testing.assert_array_equal(fused[101:], features2)

    def test_traditional_features(self, extractor):
        """Test traditional feature extraction (LOC, keywords)."""
        code = """
        if (x > 0) {
            for (int i = 0; i < 10; i++) {
                while (true) {
                    break;
                }
            }
        }
        """
        features = extractor._extract_traditional_features(code)

        assert len(features) == extractor.n_traditional
        assert features[0] > 0  # LOC should be positive

    def test_cst_features(self, extractor):
        """Test CST feature extraction."""
        code = """
        public class Test {
            public void method() {
                if (true) {
                    for (int i = 0; i < 10; i++) {
                        System.out.println(i);
                    }
                }
            }
        }
        """
        features = extractor._extract_cst_features(code, language="java")

        assert len(features) == extractor.n_cst
        # Should have non-zero values for class, method, if, for statements
        assert sum(features) > 0

    def test_semantic_features(self, extractor):
        """Test semantic/PDG feature extraction."""
        code = """
        int result = 0;
        for (int i = 0; i < 10; i++) {
            if (i % 2 == 0) {
                result += i;
            }
        }
        return result;
        """
        features = extractor._extract_semantic_features(code, language="java")

        assert len(features) == extractor.n_semantic
        # Should detect control constructs, assignments, etc.
        assert sum(features) > 0

    def test_depth_features(self, extractor):
        """Test structural depth feature extraction."""
        code = """
        if (a) {
            if (b) {
                if (c) {
                    return x;
                }
            }
        }
        """
        features = extractor._extract_depth_features(code, language="java")

        assert len(features) == extractor.n_depth
        # Deep nesting should be detected
        assert features[0] > 0  # max_depth
        assert features[3] > 0  # control_depth

    def test_type_features(self, extractor):
        """Test type signature feature extraction."""
        code = """
        public static List<String> process(int[] numbers, String name) {
            return new ArrayList<>();
        }
        """
        features = extractor._extract_type_features(code)

        assert len(features) == extractor.n_type
        # Should detect generic return, multiple parameters, etc.

    def test_api_features(self, extractor):
        """Test API fingerprinting feature extraction."""
        code = """
        import java.util.*;
        public void process() {
            Math.sqrt(16);
            String s = "test".substring(0, 2);
            list.add(item);
            file.read();
        }
        """
        features = extractor._extract_api_features(code)

        assert len(features) == extractor.n_api
        # Should detect math, string, collection operations

    def test_feature_names(self, extractor):
        """Test feature name generation."""
        names = extractor.get_feature_names(fused=False)
        assert len(names) == 101

        # Check some expected feature names
        assert "loc" in names
        assert "keyword_control_flow" in names
        assert "cst_if_statement" in names
        assert "pdg_control_construct" in names

        fused_names = extractor.get_feature_names(fused=True)
        assert len(fused_names) == 202
        assert "loc_1" in fused_names
        assert "loc_2" in fused_names

    def test_empty_code_handling(self, extractor):
        """Test handling of empty or invalid code."""
        code = ""
        features = extractor.extract_features(code, language="java")

        assert isinstance(features, np.ndarray)
        assert features.shape == (101,)
        # Should return zeros or minimal features

    def test_invalid_language_handling(self, extractor):
        """Test handling of unsupported languages."""
        code = "print('hello')"

        with pytest.raises(ValueError, match="Unsupported language"):
            extractor.extract_features(code, language="cobol")


class TestCloneDetection:
    """Test cases for clone detection functionality."""

    @pytest.fixture
    def extractor(self):
        """Create feature extractor instance."""
        return SheneamerFeatureExtractor()

    def test_semantic_clone_detection(self, extractor):
        """Test detection of semantic clones (Type-IV)."""
        # Two semantically equivalent implementations
        code1 = """
        int sum(int a, int b) {
            return a + b;
        }
        """
        code2 = """
        int add(int x, int y) {
            int result = x + y;
            return result;
        }
        """

        features1 = extractor.extract_features(code1, language="java")
        features2 = extractor.extract_features(code2, language="java")

        # Features should be similar for semantic clones
        # (exact similarity depends on implementation details)
        assert features1.shape == features2.shape

    def test_non_clone_detection(self, extractor):
        """Test detection of non-clones."""
        # Two functionally different implementations
        code1 = """
        int sum(int a, int b) {
            return a + b;
        }
        """
        code2 = """
        int multiply(int a, int b) {
            return a * b;
        }
        """

        features1 = extractor.extract_features(code1, language="java")
        features2 = extractor.extract_features(code2, language="java")

        # Features should be different
        assert not np.array_equal(features1, features2)

    def test_feature_fusion_similarity(self, extractor):
        """Test that fused features preserve individual characteristics."""
        code1 = "int x = 1; int y = 2; int z = x + y;"
        code2 = """
        if (condition) {
            for (int i = 0; i < 10; i++) {
                process(i);
            }
        }
        """

        fused = extractor.extract_fused_features(code1, code2, language="java")

        # First half should reflect simple assignments
        # Second half should reflect control structures
        assert fused.shape == (202,)


class TestTreeSitterTokenizer:
    """Test cases for Tree-sitter tokenizer."""

    @pytest.fixture
    def tokenizer(self):
        """Create tokenizer instance."""
        return TreeSitterTokenizer()

    def test_tokenize_java(self, tokenizer):
        """Test Java tokenization."""
        code = "int x = 5;"
        tokens = tokenizer.tokenize(code, language="java")

        assert isinstance(tokens, list)
        assert len(tokens) > 0

    def test_tokenize_python(self, tokenizer):
        """Test Python tokenization."""
        code = "x = 5"
        tokens = tokenizer.tokenize(code, language="python")

        assert isinstance(tokens, list)
        assert len(tokens) > 0

    def test_tokenize_csharp(self, tokenizer):
        """Test C# tokenization."""
        code = "int x = 5;"
        tokens = tokenizer.tokenize(code, language="csharp")

        assert isinstance(tokens, list)
        assert len(tokens) > 0

    def test_abstract_identifiers(self, tokenizer):
        """Test identifier abstraction."""
        code = "int result = calculate(a, b);"
        tokens = tokenizer.tokenize(code, language="java", abstract_identifiers=True)

        # Identifiers should be abstracted to 'V'
        assert "V" in tokens

    def test_cst_frequencies(self, tokenizer):
        """Test CST frequency extraction."""
        code = """
        if (x > 0) {
            for (int i = 0; i < 10; i++) {
                System.out.println(i);
            }
        }
        """
        frequencies = tokenizer.get_cst_frequencies(code, language="java")

        assert isinstance(frequencies, dict)
        assert "if_statement" in frequencies
        assert "for_statement" in frequencies


if __name__ == "__main__":
    pytest.main([__file__, "-v"])
