"""
Hybrid Syntactic + Structural Feature Extractor for Clone Detection.

This module implements:
- 6 syntactic similarity metrics (TOMA-based):
  - Jaccard Similarity
  - Dice Coefficient
  - Levenshtein Distance & Ratio
  - Jaro Similarity
  - Jaro-Winkler Similarity
- Structural AST-based features:
  - Node Type Distribution (normalized counts of AST node types)
  - Structural Jaccard Similarity (intersection over union of node types)
  - AST Depth (maximum depth of the syntax tree)
  - Node Count (total nodes in AST, complexity indicator)

These features enable detection of Type-1, Type-2, and Type-3 clones with
improved recall by capturing deeper structural similarities.
"""

from collections import Counter
from typing import Optional

import numpy as np
from rapidfuzz import fuzz
from rapidfuzz.distance import JaroWinkler, Levenshtein

from ..tokenizers.tree_sitter_tokenizer import TreeSitterTokenizer

# Standardized Java AST node types for structural features
# Focused on control flow and structural constructs relevant to clone detection
JAVA_NODE_TYPES = [
    "if_statement",
    "for_statement",
    "while_statement",
    "do_statement",
    "switch_statement",
    "try_statement",
    "catch_clause",
    "finally_clause",
    "return_statement",
    "break_statement",
    "continue_statement",
    "throw_statement",
    "assert_statement",
    "local_variable_declaration",
    "assignment_expression",
    "binary_expression",
    "method_invocation",
    "class_declaration",
    "method_declaration",
    "field_declaration",
    "constructor_declaration",
    "enhanced_for_statement",
    "synchronized_statement",
    "switch_rule",
    "yield_statement",
    "labeled_statement",
    "expression_statement",
    "block",
    "parenthesized_expression",
    "cast_expression",
    "instanceof_expression",
    "lambda_expression",
    "method_reference",
    "object_creation_expression",
    "array_creation_expression",
    "ternary_expression",
    "update_expression",
    "unary_expression",
]

# Feature names for explainability (GRADELOOP-83)
SYNTACTIC_FEATURE_NAMES = [
    "feat_jaccard_similarity",
    "feat_dice_coefficient",
    "feat_levenshtein_distance",
    "feat_levenshtein_ratio",
    "feat_jaro_similarity",
    "feat_jaro_winkler_similarity",
]

STRUCTURAL_FEATURE_NAMES = [
    "feat_ast_jaccard",
    "feat_ast_depth_diff",
    "feat_ast_node_count_diff",
    "feat_ast_node_count_ratio",
    # Structural density: AST nodes per line of code.
    # Captures code complexity independent of textual similarity.
    # Critical for Type-3 recall: near-misses share control-flow density
    # even when identifiers/literals diverge significantly.
    "feat_structural_density_1",
    "feat_structural_density_2",
    "feat_structural_density_diff",
]

# Node type distribution features (normalized counts for each node type)
NODE_TYPE_FEATURE_PREFIX = "feat_node_"


class SyntacticFeatureExtractor:
    """
    Hybrid syntactic + structural feature extractor for clone detection.

    Combines 6 TOMA-based syntactic similarity metrics with AST-based
    structural features for improved Type-1/2/3 clone detection.
    """

    def __init__(self, language: str = "java", include_node_types: bool = True):
        """
        Initialize the hybrid feature extractor.

        Args:
            language: Programming language ('java', 'c', 'python')
            include_node_types: Whether to include node type distribution features
        """
        self.language = language
        self.include_node_types = include_node_types
        self.tokenizer = TreeSitterTokenizer()

        # Build feature names list
        self.feature_names = SYNTACTIC_FEATURE_NAMES.copy()
        self.feature_names.extend(STRUCTURAL_FEATURE_NAMES)

        # Add node type distribution features if enabled
        if self.include_node_types:
            for node_type in JAVA_NODE_TYPES:
                self.feature_names.append(f"{NODE_TYPE_FEATURE_PREFIX}{node_type}_diff")

        # Cache for AST node types supported by the language
        self._node_types = (
            JAVA_NODE_TYPES if language == "java" else JAVA_NODE_TYPES
        )  # Can be extended for other languages

    def extract_features(self, tokens1: list[str], tokens2: list[str]) -> np.ndarray:
        """
        Extract hybrid syntactic + structural features from two token sequences.

        Args:
            tokens1: Token sequence from code snippet 1
            tokens2: Token sequence from code snippet 2

        Returns:
            Numpy array of similarity features (6 syntactic + 4 structural + optional node types)
        """
        # Convert token lists to strings for string-based metrics
        str1 = " ".join(tokens1)
        str2 = " ".join(tokens2)

        # Calculate syntactic features
        jaccard = self._jaccard_similarity(tokens1, tokens2)
        dice = self._dice_coefficient(tokens1, tokens2)
        lev_dist = Levenshtein.distance(str1, str2)
        lev_rat = fuzz.ratio(str1, str2) / 100.0  # rapidfuzz returns 0-100
        jaro = JaroWinkler.normalized_similarity(str1, str2)
        jaro_wink = JaroWinkler.similarity(str1, str2)

        syntactic_features = [jaccard, dice, lev_dist, lev_rat, jaro, jaro_wink]

        # Structural features will be computed from raw code
        # For backward compatibility, we compute them from tokens joined as strings
        structural_features = self._extract_structural_features(str1, str2)

        # Combine all features
        all_features = syntactic_features + structural_features

        return np.array(all_features)

    def extract_features_from_code(
        self, code1: str, code2: str, language: Optional[str] = None
    ) -> np.ndarray:
        """
        Extract hybrid features directly from source code.

        This is the preferred method when you have raw code snippets.

        Args:
            code1: Source code snippet 1
            code2: Source code snippet 2
            language: Programming language (uses instance default if None)

        Returns:
            Numpy array of similarity features
        """
        lang = language if language else self.language

        # Tokenize code
        try:
            tokens1 = self.tokenizer.tokenize(code1, lang, abstract_identifiers=True)
            tokens2 = self.tokenizer.tokenize(code2, lang, abstract_identifiers=True)
        except Exception:
            # Fallback: use raw code as tokens
            tokens1 = code1.split()
            tokens2 = code2.split()

        # Get syntactic features from tokens
        str1 = " ".join(tokens1)
        str2 = " ".join(tokens2)

        jaccard = self._jaccard_similarity(tokens1, tokens2)
        dice = self._dice_coefficient(tokens1, tokens2)
        lev_dist = Levenshtein.distance(str1, str2)
        lev_rat = fuzz.ratio(str1, str2) / 100.0
        jaro = JaroWinkler.normalized_similarity(str1, str2)
        jaro_wink = JaroWinkler.similarity(str1, str2)

        syntactic_features = [jaccard, dice, lev_dist, lev_rat, jaro, jaro_wink]

        # Extract structural features from AST
        structural_features = self._extract_structural_features(code1, code2)

        # Combine all features
        all_features = syntactic_features + structural_features

        return np.array(all_features)

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

    def _extract_structural_features(self, code1: str, code2: str) -> list[float]:
        """
        Extract AST-based structural features from two code snippets.

        Features include:
        - Structural Jaccard Similarity (intersection over union of node types)
        - AST Depth difference (normalized)
        - AST Node Count difference (normalized)
        - AST Node Count ratio
        - Node Type Distribution differences (if enabled)

        Args:
            code1: Source code snippet 1
            code2: Source code snippet 2

        Returns:
            List of structural feature values
        """
        # Parse both code snippets and extract AST information
        try:
            ast_info1 = self._parse_code_safely(code1)
            ast_info2 = self._parse_code_safely(code2)
        except Exception as e:
            # Return zeros matching the full structural feature count:
            # 4 core AST + 3 structural density + (N node-type dists if enabled)
            n_structural_features = len(STRUCTURAL_FEATURE_NAMES)
            if self.include_node_types:
                n_structural_features += len(self._node_types)
            return [0.0] * n_structural_features

        # Extract structural features
        features = []

        # 1. Structural Jaccard Similarity
        struct_jaccard = self._structural_jaccard(
            ast_info1["node_types"], ast_info2["node_types"]
        )
        features.append(struct_jaccard)

        # 2. AST Depth difference (normalized)
        depth_diff = self._normalize_depth_diff(
            ast_info1["max_depth"], ast_info2["max_depth"]
        )
        features.append(depth_diff)

        # 3. AST Node Count difference (normalized)
        node_count_diff = self._normalize_node_count_diff(
            ast_info1["node_count"], ast_info2["node_count"]
        )
        features.append(node_count_diff)

        # 4. AST Node Count ratio
        node_count_ratio = self._node_count_ratio(
            ast_info1["node_count"], ast_info2["node_count"]
        )
        features.append(node_count_ratio)

        # 5. Structural Density: AST node_count / LOC for each snippet
        #    Captures complexity (nesting + control-flow) independent of text.
        density1 = self._structural_density(code1, ast_info1["node_count"])
        density2 = self._structural_density(code2, ast_info2["node_count"])
        density_diff = abs(density1 - density2)
        features.append(density1)
        features.append(density2)
        features.append(density_diff)

        # 6. Node Type Distribution differences (if enabled)
        if self.include_node_types:
            node_type_diffs = self._node_type_distribution_diff(
                ast_info1["node_type_counts"], ast_info2["node_type_counts"]
            )
            features.extend(node_type_diffs)

        return features

    def _parse_code_safely(self, code: str) -> dict:
        """
        Parse code and extract AST information safely.

        Handles malformed code gracefully without crashing.

        Args:
            code: Source code string

        Returns:
            Dictionary with AST information:
            - node_types: set of node types present
            - node_type_counts: dict of node type -> count
            - max_depth: maximum AST depth
            - node_count: total node count
        """
        try:
            # Use tree-sitter tokenizer to parse and extract CST information
            cst_freqs = self.tokenizer.get_cst_frequencies(code, self.language)

            if not cst_freqs:
                # Empty parse result
                return {
                    "node_types": set(),
                    "node_type_counts": {},
                    "max_depth": 0,
                    "node_count": 0,
                }

            # Get node types present
            node_types = set(cst_freqs.keys())

            # Calculate total node count
            node_count = sum(cst_freqs.values())

            # Estimate max depth (heuristic: log of node count)
            # For more accurate depth, we'd need to traverse the tree
            max_depth = self._estimate_ast_depth(code, self.language)

            # Filter to only our standardized node types
            filtered_counts = {nt: cst_freqs.get(nt, 0) for nt in self._node_types}

            loc = len([l for l in code.splitlines() if l.strip()])
            return {
                "node_types": node_types,
                "node_type_counts": filtered_counts,
                "max_depth": max_depth,
                "node_count": node_count,
                "loc": loc,
            }

        except Exception as e:
            # Return empty AST info on parse failure
            return {
                "node_types": set(),
                "node_type_counts": {},
                "max_depth": 0,
                "node_count": 0,
                "loc": 0,
            }

    def _estimate_ast_depth(self, code: str, language: str) -> int:
        """
        Estimate AST depth from code.

        Uses brace/indentation counting as a heuristic when
        full tree traversal is not available.

        Args:
            code: Source code string
            language: Programming language

        Returns:
            Estimated maximum AST depth
        """
        try:
            # Parse the tree and traverse to find max depth
            parser = self.tokenizer.parsers.get(language)
            if parser is None:
                return self._depth_from_heuristics(code)

            code_bytes = code.encode("utf-8", errors="ignore")
            tree = parser.parse(code_bytes)

            # Traverse tree to find max depth
            max_depth = self._get_tree_max_depth(tree.root_node)
            return max_depth

        except Exception:
            return self._depth_from_heuristics(code)

    def _get_tree_max_depth(self, node) -> int:
        """
        Recursively find maximum depth of a tree-sitter node.

        Args:
            node: Tree-sitter node

        Returns:
            Maximum depth from this node
        """
        if node.child_count == 0:
            return 1

        max_child_depth = 0
        for child in node.children:
            child_depth = self._get_tree_max_depth(child)
            max_child_depth = max(max_child_depth, child_depth)

        return 1 + max_child_depth

    def _depth_from_heuristics(self, code: str) -> int:
        """
        Estimate AST depth using brace counting heuristics.

        Args:
            code: Source code string

        Returns:
            Estimated depth
        """
        max_depth = 0
        current_depth = 0

        for char in code:
            if char == "{":
                current_depth += 1
                max_depth = max(max_depth, current_depth)
            elif char == "}":
                current_depth = max(0, current_depth - 1)

        return max_depth

    def _structural_jaccard(
        self, node_types1: set[str], node_types2: set[str]
    ) -> float:
        """
        Calculate Structural Jaccard Similarity between two ASTs.

        J(A, B) = |A ∩ B| / |A ∪ B|

        Measures the overlap of AST node types between two code snippets.

        Args:
            node_types1: Set of node types in AST 1
            node_types2: Set of node types in AST 2

        Returns:
            Structural Jaccard similarity in [0, 1]
        """
        if not node_types1 and not node_types2:
            return 1.0

        intersection = len(node_types1 & node_types2)
        union = len(node_types1 | node_types2)

        if union == 0:
            return 0.0

        return intersection / union

    def _normalize_depth_diff(self, depth1: int, depth2: int) -> float:
        """
        Normalize AST depth difference to [0, 1] range.

        Uses: 1 - (|d1 - d2| / max(d1, d2))

        Args:
            depth1: AST depth of code 1
            depth2: AST depth of code 2

        Returns:
            Normalized depth difference (1 = same depth, 0 = maximally different)
        """
        if depth1 == 0 and depth2 == 0:
            return 1.0

        max_depth = max(depth1, depth2)
        if max_depth == 0:
            return 0.0

        diff = abs(depth1 - depth2)
        return 1.0 - (diff / max_depth)

    def _normalize_node_count_diff(
        self, count1: int, count2: int, max_count: int = 1000
    ) -> float:
        """
        Normalize AST node count difference to [0, 1] range.

        Uses: 1 - (|c1 - c2| / max(c1, c2))

        Args:
            count1: Node count of AST 1
            count2: Node count of AST 2
            max_count: Maximum expected node count for scaling

        Returns:
            Normalized node count difference
        """
        if count1 == 0 and count2 == 0:
            return 1.0

        max_nodes = max(count1, count2)
        if max_nodes == 0:
            return 0.0

        diff = abs(count1 - count2)
        return 1.0 - (diff / max_nodes)

    def _node_count_ratio(self, count1: int, count2: int) -> float:
        """
        Calculate node count ratio (min/max).

        Args:
            count1: Node count of AST 1
            count2: Node count of AST 2

        Returns:
            Node count ratio in [0, 1]
        """
        if count1 == 0 and count2 == 0:
            return 1.0

        if count1 == 0 or count2 == 0:
            return 0.0

        return min(count1, count2) / max(count1, count2)

    def _structural_density(self, code: str, node_count: int) -> float:
        """
        Compute structural density: AST node count / lines of code.

        A high density indicates deeply-nested, complex control flow.
        This metric is invariant to identifier/literal renaming, making
        it effective for detecting Type-3 near-miss clones whose text
        has diverged but whose structure remains similar.

        Args:
            code: Source code string
            node_count: Total AST node count

        Returns:
            Density value (nodes per line), clamped to [0, 50]
        """
        loc = len([l for l in code.splitlines() if l.strip()])
        if loc == 0:
            return 0.0
        # Clamp to a reasonable maximum to prevent outlier dominance
        return min(node_count / loc, 50.0)

    def _node_type_distribution_diff(
        self, counts1: dict[str, int], counts2: dict[str, int]
    ) -> list[float]:
        """
        Calculate normalized differences in node type distributions.

        For each node type, computes: 1 - (|c1 - c2| / max(c1, c2))

        Args:
            counts1: Node type counts for AST 1
            counts2: Node type counts for AST 2

        Returns:
            List of normalized differences for each node type
        """
        diffs = []

        for node_type in self._node_types:
            c1 = counts1.get(node_type, 0)
            c2 = counts2.get(node_type, 0)

            if c1 == 0 and c2 == 0:
                # Both have zero of this node type - perfect match
                diffs.append(1.0)
            elif c1 == 0 or c2 == 0:
                # One has it, one doesn't - no match
                diffs.append(0.0)
            else:
                # Both have some - calculate normalized similarity
                max_count = max(c1, c2)
                diff = abs(c1 - c2)
                similarity = 1.0 - (diff / max_count)
                diffs.append(similarity)

        return diffs

    def extract_features_batch(
        self, token_pairs: list[tuple[list[str], list[str]]]
    ) -> np.ndarray:
        """
        Extract features for multiple token pairs.

        Args:
            token_pairs: List of (tokens1, tokens2) tuples

        Returns:
            Numpy array of shape (n_pairs, n_features)
        """
        features = []
        for tokens1, tokens2 in token_pairs:
            feat = self.extract_features(tokens1, tokens2)
            features.append(feat)

        return np.array(features)

    def extract_features_from_code_batch(
        self, code_pairs: list[tuple[str, str]], language: Optional[str] = None
    ) -> np.ndarray:
        """
        Extract features for multiple code pairs directly from source code.

        This is the preferred method for batch processing.

        Args:
            code_pairs: List of (code1, code2) tuples
            language: Programming language (uses instance default if None)

        Returns:
            Numpy array of shape (n_pairs, n_features)
        """
        features = []
        for code1, code2 in code_pairs:
            feat = self.extract_features_from_code(code1, code2, language)
            features.append(feat)

        return np.array(features)

    @staticmethod
    def normalize_features(features: np.ndarray) -> np.ndarray:
        """
        Normalize syntactic features for ML model input.

        Applies min-max normalization to bring all features to [0, 1] range.
        Special handling for Levenshtein distance which is unbounded.

        Args:
            features: Array of shape (n_samples, n_features)

        Returns:
            Normalized features
        """
        normalized = features.copy().astype(float)

        # Jaccard and Dice are already in [0, 1] (indices 0, 1)
        # Levenshtein distance needs normalization (use log transform) (index 2)
        # Levenshtein ratio, Jaro, and Jaro-Winkler are in [0, 1] (indices 3, 4, 5)
        # Structural features are mostly in [0, 1] already

        # For Levenshtein distance, apply log(1 + x) / max_log
        if features.shape[1] > 2:
            max_dist = np.max(normalized[:, 2])
            if max_dist > 0:
                normalized[:, 2] = np.log1p(normalized[:, 2]) / np.log1p(max_dist)

        return normalized

    def get_feature_names(self) -> list[str]:
        """Get the names of the extracted features."""
        return self.feature_names.copy()

    def get_feature_names_dict(self) -> dict[int, str]:
        """
        Get a mapping of feature indices to feature names.

        Useful for explainability and feature importance visualization (GRADELOOP-83).

        Returns:
            Dictionary mapping feature index to feature name
        """
        return {i: name for i, name in enumerate(self.feature_names)}

    def get_syntactic_feature_names(self) -> list[str]:
        """Get names of syntactic features only."""
        return SYNTACTIC_FEATURE_NAMES.copy()

    def get_structural_feature_names(self) -> list[str]:
        """Get names of structural features only."""
        return STRUCTURAL_FEATURE_NAMES.copy()

    def get_node_type_feature_names(self) -> list[str]:
        """Get names of node type distribution features."""
        if self.include_node_types:
            return [f"{NODE_TYPE_FEATURE_PREFIX}{nt}_diff" for nt in self._node_types]
        return []

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


def calculate_pairwise_features(
    tokens_list: list[list[str]], include_structural: bool = False
) -> np.ndarray:
    """
    Calculate pairwise syntactic features for all code pairs.

    Args:
        tokens_list: List of token sequences for n code snippets
        include_structural: Whether to include structural features

    Returns:
        Array of shape (n*(n-1)/2, n_features) with features for each pair
    """
    extractor = SyntacticFeatureExtractor(include_node_types=include_structural)
    n = len(tokens_list)
    num_pairs = n * (n - 1) // 2

    n_features = len(extractor.feature_names)
    features = np.zeros((num_pairs, n_features))
    idx = 0

    for i in range(n):
        for j in range(i + 1, n):
            features[idx] = extractor.extract_features(tokens_list[i], tokens_list[j])
            idx += 1

    return features


def calculate_pairwise_features_from_code(
    code_list: list[str], language: str = "java", include_node_types: bool = True
) -> tuple[np.ndarray, list[str]]:
    """
    Calculate pairwise hybrid features for all code pairs from source code.

    This is the preferred function for batch processing code snippets.

    Args:
        code_list: List of source code snippets
        language: Programming language
        include_node_types: Whether to include node type distribution features

    Returns:
        Tuple of (features array, feature names list)
    """
    extractor = SyntacticFeatureExtractor(
        language=language, include_node_types=include_node_types
    )
    n = len(code_list)
    num_pairs = n * (n - 1) // 2

    n_features = len(extractor.feature_names)
    features = np.zeros((num_pairs, n_features))
    idx = 0

    for i in range(n):
        for j in range(i + 1, n):
            features[idx] = extractor.extract_features_from_code(
                code_list[i], code_list[j]
            )
            idx += 1

    return features, extractor.get_feature_names()
