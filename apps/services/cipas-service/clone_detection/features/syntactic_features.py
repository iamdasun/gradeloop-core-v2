"""
Pipeline A: Syntactic Similarity Features (TOMA-based).

This module implements six similarity metrics for token sequences:
- Jaccard Similarity
- Dice Coefficient
- Levenshtein Distance & Ratio
- Jaro Similarity
- Jaro-Winkler Similarity

These features are used for detecting Type-1, Type-2, and Type-3 clones.

TOMA (Token-based) Approach:
- Token Frequency Vector for Type-3 detection
- Token Sequence Stream for structural comparison
"""

from collections import Counter
from typing import Optional

import numpy as np
from rapidfuzz import fuzz
from rapidfuzz.distance import JaroWinkler, Levenshtein


class SyntacticFeatureExtractor:
    """
    Extract syntactic similarity features from token sequences.

    Implements the TOMA approach for Type-1/2/3 clone detection using
    six string/token similarity metrics and token frequency vectors.
    """

    def __init__(self):
        """Initialize the syntactic feature extractor."""
        self.feature_names = [
            "jaccard_similarity",
            "dice_coefficient",
            "levenshtein_distance",
            "levenshtein_ratio",
            "jaro_similarity",
            "jaro_winkler_similarity",
        ]

    def extract_features(self, tokens1: list[str], tokens2: list[str]) -> np.ndarray:
        """
        Extract all six syntactic similarity features from two token sequences.

        Args:
            tokens1: Token sequence from code snippet 1
            tokens2: Token sequence from code snippet 2

        Returns:
            Numpy array of 6 similarity features
        """
        # Convert token lists to strings for string-based metrics
        str1 = " ".join(tokens1)
        str2 = " ".join(tokens2)

        # Calculate all features
        jaccard = self._jaccard_similarity(tokens1, tokens2)
        dice = self._dice_coefficient(tokens1, tokens2)
        lev_dist = Levenshtein.distance(str1, str2)
        lev_rat = fuzz.ratio(str1, str2) / 100.0  # rapidfuzz returns 0-100
        jaro = JaroWinkler.normalized_similarity(str1, str2)
        jaro_wink = JaroWinkler.similarity(str1, str2)

        return np.array([jaccard, dice, lev_dist, lev_rat, jaro, jaro_wink])

    def _jaccard_similarity(self, tokens1: list[str], tokens2: list[str]) -> float:
        """
        Calculate Jaccard similarity coefficient.

        J(A, B) = |A ∩ B| / |A ∪ B|

        Measures the overlap of common elements between two sets.
        Effective for Type-1 and Type-2 clones.

        Args:
            tokens1: First token sequence
            tokens2: Second token sequence

        Returns:
            Jaccard similarity value in [0, 1]
        """
        set1 = set(tokens1)
        set2 = set(tokens2)

        intersection = len(set1 & set2)
        union = len(set1 | set2)

        if union == 0:
            return 0.0

        return intersection / union

    def _dice_coefficient(self, tokens1: list[str], tokens2: list[str]) -> float:
        """
        Calculate Dice coefficient (Sørensen-Dice index).

        D(A, B) = 2 * |A ∩ B| / (|A| + |B|)

        Similar to Jaccard but gives more weight to common elements.
        Better for comparing sequences of different lengths.

        Args:
            tokens1: First token sequence
            tokens2: Second token sequence

        Returns:
            Dice coefficient value in [0, 1]
        """
        set1 = set(tokens1)
        set2 = set(tokens2)

        intersection = len(set1 & set2)

        if len(set1) + len(set2) == 0:
            return 0.0

        return (2 * intersection) / (len(set1) + len(set2))

    def extract_features_batch(
        self, token_pairs: list[tuple[list[str], list[str]]]
    ) -> np.ndarray:
        """
        Extract features for multiple token pairs.

        Args:
            token_pairs: List of (tokens1, tokens2) tuples

        Returns:
            Numpy array of shape (n_pairs, 6)
        """
        features = []
        for tokens1, tokens2 in token_pairs:
            feat = self.extract_features(tokens1, tokens2)
            features.append(feat)

        return np.array(features)

    @staticmethod
    def normalize_features(features: np.ndarray) -> np.ndarray:
        """
        Normalize syntactic features for ML model input.

        Applies min-max normalization to bring all features to [0, 1] range.
        Special handling for Levenshtein distance which is unbounded.

        Args:
            features: Array of shape (n_samples, 6)

        Returns:
            Normalized features
        """
        normalized = features.copy().astype(float)

        # Jaccard and Dice are already in [0, 1]
        # Levenshtein distance needs normalization (use log transform)
        # Levenshtein ratio, Jaro, and Jaro-Winkler are in [0, 1]

        # For Levenshtein distance, apply log(1 + x) / max_log
        max_dist = np.max(normalized[:, 2])
        if max_dist > 0:
            normalized[:, 2] = np.log1p(normalized[:, 2]) / np.log1p(max_dist)

        return normalized

    def get_feature_names(self) -> list[str]:
        """Get the names of the extracted features."""
        return self.feature_names.copy()

    def get_token_frequency_vector(self, tokens: list[str]) -> np.ndarray:
        """
        Generate Token Frequency Vector for TOMA approach.

        Args:
            tokens: Token sequence

        Returns:
            Numpy array of token frequencies
        """
        counter = Counter(tokens)
        return counter

    def get_token_sequence_stream(self, tokens: list[str]) -> str:
        """
        Generate Token Sequence Stream for TOMA approach.

        Args:
            tokens: Token sequence

        Returns:
            Space-separated token sequence string
        """
        return " ".join(tokens)

    def extract_toma_features(
        self, tokens1: list[str], tokens2: list[str]
    ) -> dict[str, float]:
        """
        Extract TOMA-style features for Type-3 clone detection.

        This includes:
        - Token frequency vector similarity (cosine similarity)
        - Token sequence stream similarity

        Args:
            tokens1: Token sequence from code snippet 1
            tokens2: Token sequence from code snippet 2

        Returns:
            Dictionary of TOMA features
        """
        # Token frequency vectors
        freq1 = Counter(tokens1)
        freq2 = Counter(tokens2)

        # Cosine similarity of frequency vectors
        cosine_sim = self._cosine_similarity(freq1, freq2)

        # Token sequence stream
        stream1 = self.get_token_sequence_stream(tokens1)
        stream2 = self.get_token_sequence_stream(tokens2)

        # Sequence similarity using Levenshtein
        seq_similarity = fuzz.ratio(stream1, stream2) / 100.0

        return {
            "token_frequency_cosine": cosine_sim,
            "token_sequence_similarity": seq_similarity,
        }

    def _cosine_similarity(self, counter1: Counter, counter2: Counter) -> float:
        """
        Calculate cosine similarity between two token frequency counters.

        Args:
            counter1: Token frequency counter 1
            counter2: Token frequency counter 2

        Returns:
            Cosine similarity in [0, 1]
        """
        # Get all unique tokens
        all_tokens = set(counter1.keys()) | set(counter2.keys())

        if not all_tokens:
            return 1.0

        # Create vectors
        vec1 = np.array([counter1.get(token, 0) for token in all_tokens])
        vec2 = np.array([counter2.get(token, 0) for token in all_tokens])

        # Calculate cosine similarity
        dot_product = np.dot(vec1, vec2)
        norm1 = np.linalg.norm(vec1)
        norm2 = np.linalg.norm(vec2)

        if norm1 == 0 or norm2 == 0:
            return 0.0

        return dot_product / (norm1 * norm2)


def calculate_pairwise_features(tokens_list: list[list[str]]) -> np.ndarray:
    """
    Calculate pairwise syntactic features for all code pairs.

    Args:
        tokens_list: List of token sequences for n code snippets

    Returns:
        Array of shape (n*(n-1)/2, 6) with features for each pair
    """
    extractor = SyntacticFeatureExtractor()
    n = len(tokens_list)
    num_pairs = n * (n - 1) // 2

    features = np.zeros((num_pairs, 6))
    idx = 0

    for i in range(n):
        for j in range(i + 1, n):
            features[idx] = extractor.extract_features(tokens_list[i], tokens_list[j])
            idx += 1

    return features
