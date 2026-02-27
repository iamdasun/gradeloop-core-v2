"""
Pipeline B: Semantic Feature Fusion (XGBoost-based).

This module extracts and fuses 100+ features from three categories:
1. Traditional Features: LOC, keyword counts, complexity metrics
2. Syntactic (CST) Features: Frequencies of non-leaf nodes from Tree-sitter CST
3. Semantic (PDG-like) Features: Frequencies of dependency relationships
4. Structural Depth Features: CST depth, node ratios, nesting patterns
5. Type Signatures: Parameter and return type encodings

Features are fused using Linear Combination (concatenation) for XGBoost classification.
This pipeline is designed for detecting Type-4 (semantic) clones.
"""

import re
from typing import Optional

import numpy as np

from ..tokenizers.tree_sitter_tokenizer import TreeSitterTokenizer


class SemanticFeatureExtractor:
    """
    Extract semantic features for Type-4 clone detection.

    Implements feature fusion from traditional, syntactic, and semantic
    feature categories using linear combination (concatenation).

    Feature Breakdown (100+ features per code snippet):
    - Traditional: 15 features (LOC, keyword categories, complexity)
    - CST: 40 features (syntactic construct frequencies)
    - Semantic/PDG: 20 features (dependency relationships)
    - Structural Depth: 15 features (nesting, depth, ratios)
    - Type Signatures: 10 features (parameter/return type patterns)
    - API Fingerprinting: 10 features (call patterns, depth)
    """

    # Traditional keyword categories for feature extraction
    KEYWORD_CATEGORIES = {
        "control_keywords": {
            "if",
            "else",
            "switch",
            "case",
            "for",
            "while",
            "do",
            "break",
            "continue",
            "return",
            "goto",
            "try",
            "catch",
            "finally",
            "throw",
        },
        "declaration_keywords": {
            "int",
            "float",
            "double",
            "char",
            "void",
            "boolean",
            "byte",
            "short",
            "long",
            "unsigned",
            "signed",
            "const",
            "static",
            "public",
            "private",
            "protected",
            "class",
            "interface",
            "struct",
        },
        "memory_keywords": {
            "new",
            "delete",
            "malloc",
            "free",
            "alloc",
            "sizeof",
            "this",
            "self",
        },
        "import_keywords": {
            "import",
            "from",
            "include",
            "require",
            "using",
            "package",
            "namespace",
            "export",
        },
        "exception_keywords": {
            "try",
            "catch",
            "finally",
            "throw",
            "throws",
            "except",
            "raise",
            "assert",
        },
        "loop_keywords": {"for", "while", "do", "foreach", "break", "continue"},
        "conditional_keywords": {"if", "else", "switch", "case", "default", "elif"},
        "io_keywords": {
            "print",
            "println",
            "printf",
            "scanf",
            "read",
            "write",
            "input",
            "output",
        },
        "arithmetic_keywords": {"add", "sub", "mul", "div", "mod", "sum", "product"},
    }

    # CST node types to track (language-agnostic where possible)
    CST_NODE_TYPES = [
        "function_definition",
        "method_declaration",
        "class_definition",
        "class_declaration",
        "interface_declaration",
        "if_statement",
        "for_statement",
        "while_statement",
        "do_statement",
        "switch_statement",
        "case_statement",
        "try_statement",
        "catch_clause",
        "finally_clause",
        "variable_declaration",
        "local_variable_declaration",
        "field_declaration",
        "assignment_expression",
        "binary_expression",
        "unary_expression",
        "ternary_expression",
        "method_invocation",
        "call_expression",
        "return_statement",
        "break_statement",
        "continue_statement",
        "block",
        "parameter_list",
        "argument_list",
        "array_creation",
        "lambda_expression",
        "comprehension",
        "decorated_definition",
        "with_statement",
        "yield_statement",
        "assert_statement",
        "raise_statement",
        "import_statement",
        "expression_statement",
        "labeled_statement",
    ]

    # Semantic relationship types (PDG-like)
    RELATIONSHIP_TYPES = [
        "control_construct",
        "assignment",
        "function_call",
        "return",
        "binary_operation",
        "unary_operation",
        "array_access",
        "field_access",
        "method_call",
        "constructor_call",
        "loop_construct",
        "conditional_branch",
        "exception_handling",
        "variable_read",
        "variable_write",
        "data_dependency",
        "control_dependency",
        "nested_construct",
        "recursive_call",
        "iterative_construct",
    ]

    # Type signature patterns
    TYPE_PATTERNS = [
        "primitive_return",  # int, float, boolean, etc.
        "void_return",  # void methods
        "object_return",  # Object, String, custom classes
        "array_return",  # int[], String[], etc.
        "generic_return",  # List<T>, Map<K,V>, etc.
        "no_parameter",  # methods with no parameters
        "single_parameter",  # methods with one parameter
        "multiple_parameters",  # methods with multiple parameters
        "varargs",  # methods with variable arguments
        "constructor",  # constructor patterns
        "abstract_method",  # abstract method patterns
        "static_method",  # static method patterns
    ]

    # API/Call patterns for fingerprinting
    API_PATTERNS = [
        "math_operations",  # Math.*, sqrt, pow, abs, etc.
        "string_operations",  # length, substring, concat, etc.
        "collection_operations",  # add, get, remove, size, etc.
        "io_operations",  # read, write, print, etc.
        "network_operations",  # connect, send, receive, etc.
        "thread_operations",  # start, run, sleep, wait, etc.
        "reflection_operations",  # getClass, getField, invoke, etc.
        "stream_operations",  # map, filter, reduce, collect, etc.
        "error_handling",  # throw, catch, error, exception, etc.
        "utility_calls",  # helper, util, helper, common, etc.
        "date_time_operations",  # Date, Time, Calendar, now, etc.
        "serialization",  # serialize, deserialize, parse, format, etc.
    ]

    def __init__(self, tokenizer: Optional[TreeSitterTokenizer] = None):
        """
        Initialize the semantic feature extractor.

        Args:
            tokenizer: TreeSitterTokenizer instance (created if not provided)
        """
        self.tokenizer = tokenizer or TreeSitterTokenizer()

        # Calculate total feature count
        self.n_traditional = 1 + len(
            self.KEYWORD_CATEGORIES
        )  # LOC + keyword categories
        self.n_cst = len(self.CST_NODE_TYPES)
        self.n_semantic = len(self.RELATIONSHIP_TYPES)
        self.n_depth = 8  # Structural depth features
        self.n_type = len(self.TYPE_PATTERNS)
        self.n_api = len(self.API_PATTERNS)

        # Total features per code snippet
        self.n_features_per_code = (
            self.n_traditional
            + self.n_cst
            + self.n_semantic
            + self.n_depth
            + self.n_type
            + self.n_api
        )

        # For fused features (concatenation of two code snippets)
        self.n_fused_features = 2 * self.n_features_per_code

        self.feature_names = self._generate_feature_names()

    def extract_features(self, code: str, language: str = "java") -> np.ndarray:
        """
        Extract all semantic features from a single code snippet.

        Args:
            code: Source code string
            language: Programming language ('java', 'c', 'python')

        Returns:
            Numpy array of features
        """
        features = []

        # 1. Traditional features
        traditional = self._extract_traditional_features(code)
        features.extend(traditional)

        # 2. Syntactic (CST) features
        cst_features = self._extract_cst_features(code, language)
        features.extend(cst_features)

        # 3. Semantic (PDG-like) features
        semantic_features = self._extract_semantic_features(code, language)
        features.extend(semantic_features)

        # 4. Structural depth features
        depth_features = self._extract_depth_features(code, language)
        features.extend(depth_features)

        # 5. Type signature features
        type_features = self._extract_type_features(code)
        features.extend(type_features)

        # 6. API fingerprinting features
        api_features = self._extract_api_features(code)
        features.extend(api_features)

        return np.array(features, dtype=np.float64)

    def extract_fused_features(
        self, code1: str, code2: str, language: str = "java"
    ) -> np.ndarray:
        """
        Extract and fuse features from two code snippets using linear combination.

        Linear combination (concatenation) preserves original feature values
        and yields better results for tree-ensemble models like XGBoost.

        Args:
            code1: First source code string
            code2: Second source code string
            language: Programming language

        Returns:
            Concatenated feature vector [features1, features2]
        """
        features1 = self.extract_features(code1, language)
        features2 = self.extract_features(code2, language)

        # Linear combination via concatenation
        fused = np.concatenate([features1, features2])

        return fused

    def _extract_traditional_features(self, code: str) -> list[float]:
        """
        Extract traditional code metrics.

        Features:
        - Lines of code (LOC)
        - Keyword category counts (normalized by LOC)

        Args:
            code: Source code string

        Returns:
            List of traditional feature values
        """
        features = []

        # Lines of code
        loc = len(code.splitlines())
        features.append(float(loc))

        # Keyword category counts (normalized)
        code_lower = code.lower()
        # Tokenize for keyword matching
        tokens = re.findall(r"\b\w+\b", code_lower)
        token_set = set(tokens)

        for category, keywords in self.KEYWORD_CATEGORIES.items():
            count = len(token_set & keywords)
            # Normalize by LOC to handle different code lengths
            normalized = count / max(loc, 1)
            features.append(normalized)

        return features

    def _extract_cst_features(self, code: str, language: str) -> list[float]:
        """
        Extract syntactic features from Tree-sitter CST.

        Counts frequencies of non-leaf node types (syntactic constructs).

        Args:
            code: Source code string
            language: Programming language

        Returns:
            List of CST feature values (normalized frequencies)
        """
        try:
            frequencies = self.tokenizer.get_cst_frequencies(code, language)
        except Exception:
            # Return zeros if parsing fails
            return [0.0] * self.n_cst

        features = []
        total_nodes = sum(frequencies.values())

        for node_type in self.CST_NODE_TYPES:
            count = frequencies.get(node_type, 0)
            # Normalize by total nodes
            normalized = count / max(total_nodes, 1)
            features.append(normalized)

        return features

    def _extract_semantic_features(self, code: str, language: str) -> list[float]:
        """
        Extract semantic (PDG-like) dependency features.

        Counts frequencies of dependency relationships that approximate
        Program Dependency Graph (PDG) information.

        Args:
            code: Source code string
            language: Programming language

        Returns:
            List of semantic feature values (normalized)
        """
        try:
            relationships = self.tokenizer.get_dependency_relationships(code, language)
        except Exception:
            return [0.0] * self.n_semantic

        features = []
        total_rels = sum(relationships.values())

        for rel_type in self.RELATIONSHIP_TYPES:
            count = relationships.get(rel_type, 0)
            # Normalize by total relationships
            normalized = count / max(total_rels, 1)
            features.append(normalized)

        return features

    def _extract_depth_features(self, code: str, language: str) -> list[float]:
        """
        Extract structural depth and nesting features.

        Features:
        - Maximum CST depth
        - Average nesting depth
        - Leaf to internal node ratio
        - Control flow depth
        - Block nesting depth
        - Statement density
        - Cyclomatic complexity estimate
        - Branching factor

        Args:
            code: Source code string
            language: Programming language

        Returns:
            List of depth feature values (normalized)
        """
        try:
            tree = self.tokenizer.parsers[language].parse(code.encode("utf-8"))
            root = tree.root_node

            # Calculate depth metrics
            max_depth = self._calculate_max_depth(root)
            avg_depth = self._calculate_avg_depth(root)
            leaf_count = self._count_leaf_nodes(root)
            internal_count = self._count_internal_nodes(root)
            control_depth = self._calculate_control_depth(root)
            block_nesting = self._calculate_block_nesting(root)
            stmt_density = self._calculate_statement_density(root, code)
            branching = self._calculate_branching_factor(root)

            # Normalize by code length
            loc = max(len(code.splitlines()), 1)

            return [
                max_depth / 10.0,  # Normalize assuming max depth ~10
                avg_depth / 10.0,
                leaf_count / max(leaf_count + internal_count, 1),
                control_depth / 10.0,
                block_nesting / 10.0,
                stmt_density,
                min(stmt_density * 2, 1.0),  # Cyclomatic estimate
                branching / 5.0,  # Normalize assuming avg branching ~5
            ]
        except Exception:
            return [0.0] * self.n_depth

    def _calculate_max_depth(self, node) -> int:
        """Calculate maximum depth of CST."""
        if node.child_count == 0:
            return 1
        return 1 + max(self._calculate_max_depth(child) for child in node.children)

    def _calculate_avg_depth(self, node, current_depth: int = 1) -> float:
        """Calculate average depth of all nodes."""
        if node.child_count == 0:
            return current_depth

        total = current_depth
        count = 1
        for child in node.children:
            child_depth, child_count = self._sum_depths(child, current_depth + 1)
            total += child_depth
            count += child_count

        return total / max(count, 1)

    def _sum_depths(self, node, depth: int) -> tuple[int, int]:
        """Sum all depths and count nodes."""
        if node.child_count == 0:
            return depth, 1

        total = depth
        count = 1
        for child in node.children:
            child_total, child_count = self._sum_depths(child, depth + 1)
            total += child_total
            count += child_count

        return total, count

    def _count_leaf_nodes(self, node) -> int:
        """Count leaf nodes in CST."""
        if node.child_count == 0:
            return 1
        return sum(self._count_leaf_nodes(child) for child in node.children)

    def _count_internal_nodes(self, node) -> int:
        """Count internal nodes in CST."""
        if node.child_count == 0:
            return 0
        return 1 + sum(self._count_internal_nodes(child) for child in node.children)

    def _calculate_control_depth(self, node) -> int:
        """Calculate maximum nesting of control structures."""
        control_types = {
            "if_statement",
            "for_statement",
            "while_statement",
            "switch_statement",
        }

        if node.type in control_types:
            if node.child_count == 0:
                return 1
            return 1 + max(
                self._calculate_control_depth(child) for child in node.children
            )

        if node.child_count == 0:
            return 0

        return max(self._calculate_control_depth(child) for child in node.children)

    def _calculate_block_nesting(self, node) -> int:
        """Calculate maximum block nesting depth."""
        if node.type == "block":
            if node.child_count == 0:
                return 1
            return 1 + max(
                self._calculate_block_nesting(child) for child in node.children
            )

        if node.child_count == 0:
            return 0

        return max(self._calculate_block_nesting(child) for child in node.children)

    def _calculate_statement_density(self, node, code: str) -> float:
        """Calculate statement density (statements per line)."""
        stmt_types = {
            "expression_statement",
            "return_statement",
            "if_statement",
            "for_statement",
            "while_statement",
            "break_statement",
            "continue_statement",
            "throw_statement",
            "assert_statement",
        }

        stmt_count = self._count_node_types(node, stmt_types)
        loc = max(len(code.splitlines()), 1)

        return min(stmt_count / loc, 1.0)

    def _calculate_branching_factor(self, node) -> float:
        """Calculate average branching factor."""
        if node.child_count == 0:
            return 0

        total_children = node.child_count
        count = 1

        for child in node.children:
            child_branching = self._calculate_branching_factor(child)
            if child_branching > 0:
                total_children += child_branching
                count += 1

        return total_children / max(count, 1)

    def _count_node_types(self, node, types: set) -> int:
        """Count nodes of specified types."""
        count = 1 if node.type in types else 0

        for child in node.children:
            count += self._count_node_types(child, types)

        return count

    def _extract_type_features(self, code: str) -> list[float]:
        """
        Extract type signature features.

        Analyzes return types and parameter patterns.

        Args:
            code: Source code string

        Returns:
            List of type feature values (normalized)
        """
        features = []
        code_lower = code.lower()

        # Primitive return types
        primitives = {
            "int",
            "float",
            "double",
            "char",
            "boolean",
            "byte",
            "short",
            "long",
            "void",
        }
        primitive_count = sum(
            1 for p in primitives if re.search(rf"\b{p}\b", code_lower)
        )
        features.append(min(primitive_count / 5.0, 1.0))

        # Void return
        features.append(1.0 if "void" in code_lower else 0.0)

        # Object return (common Java/Python objects)
        object_patterns = {"object", "string", "list", "dict", "map", "set", "array"}
        object_count = sum(1 for p in object_patterns if p in code_lower)
        features.append(min(object_count / 3.0, 1.0))

        # Array return
        array_indicators = code.count("[]") + code.count("Array") + code.count("array")
        features.append(min(array_indicators / 3.0, 1.0))

        # Generic return
        generic_count = code.count("<") + code.count(">")
        features.append(min(generic_count / 4.0, 1.0))

        # Parameter patterns
        param_count = code.count("(") - code.count("()")
        features.append(1.0 if param_count == 0 else 0.0)  # No parameters
        features.append(1.0 if param_count == 1 else 0.0)  # Single parameter
        features.append(1.0 if param_count > 1 else 0.0)  # Multiple parameters

        # Varargs
        features.append(1.0 if "..." in code else 0.0)

        # Constructor pattern
        is_constructor = (
            1.0 if re.search(r"public\s+\w+\s*\([^)]*\)\s*\{", code) else 0.0
        )
        features.append(is_constructor)

        # Abstract method
        is_abstract = 1.0 if "abstract" in code_lower else 0.0
        features.append(is_abstract)

        # Static method
        is_static = 1.0 if "static" in code_lower else 0.0
        features.append(is_static)

        return features

    def _extract_api_features(self, code: str) -> list[float]:
        """
        Extract API fingerprinting features.

        Analyzes patterns of API calls and library usage.

        Args:
            code: Source code string

        Returns:
            List of API feature values (normalized)
        """
        features = []
        code_lower = code.lower()

        # Math operations
        math_patterns = {
            "math.",
            "sqrt",
            "pow",
            "abs",
            "sin",
            "cos",
            "tan",
            "log",
            "exp",
            "round",
        }
        math_count = sum(1 for p in math_patterns if p in code_lower)
        features.append(min(math_count / 3.0, 1.0))

        # String operations
        string_patterns = {
            "length",
            "substring",
            "concat",
            "split",
            "replace",
            "trim",
            "upper",
            "lower",
        }
        string_count = sum(1 for p in string_patterns if p in code_lower)
        features.append(min(string_count / 3.0, 1.0))

        # Collection operations
        collection_patterns = {
            "add",
            "get",
            "remove",
            "size",
            "contains",
            "insert",
            "delete",
            "append",
        }
        collection_count = sum(1 for p in collection_patterns if p in code_lower)
        features.append(min(collection_count / 3.0, 1.0))

        # I/O operations
        io_patterns = {
            "read",
            "write",
            "print",
            "scan",
            "input",
            "output",
            "file",
            "stream",
        }
        io_count = sum(1 for p in io_patterns if p in io_patterns and p in code_lower)
        features.append(min(io_count / 3.0, 1.0))

        # Network operations
        network_patterns = {
            "connect",
            "send",
            "receive",
            "socket",
            "http",
            "url",
            "request",
            "response",
        }
        network_count = sum(1 for p in network_patterns if p in code_lower)
        features.append(min(network_count / 3.0, 1.0))

        # Thread operations
        thread_patterns = {
            "start",
            "run",
            "sleep",
            "wait",
            "notify",
            "thread",
            "async",
            "await",
        }
        thread_count = sum(1 for p in thread_patterns if p in code_lower)
        features.append(min(thread_count / 3.0, 1.0))

        # Reflection operations
        reflection_patterns = {
            "getclass",
            "getfield",
            "invoke",
            "reflect",
            "class.",
            "type.",
        }
        reflection_count = sum(1 for p in reflection_patterns if p in code_lower)
        features.append(min(reflection_count / 3.0, 1.0))

        # Stream operations
        stream_patterns = {
            "map",
            "filter",
            "reduce",
            "collect",
            "stream",
            "lambda",
            "foreach",
        }
        stream_count = sum(1 for p in stream_patterns if p in code_lower)
        features.append(min(stream_count / 3.0, 1.0))

        # Error handling
        error_patterns = {
            "throw",
            "catch",
            "error",
            "exception",
            "try",
            "finally",
            "raise",
        }
        error_count = sum(1 for p in error_patterns if p in code_lower)
        features.append(min(error_count / 3.0, 1.0))

        # Utility calls
        utility_patterns = {
            "helper",
            "util",
            "common",
            "service",
            "manager",
            "factory",
            "builder",
        }
        utility_count = sum(1 for p in utility_patterns if p in code_lower)
        features.append(min(utility_count / 3.0, 1.0))

        # Date/Time operations
        datetime_patterns = {
            "date",
            "time",
            "calendar",
            "now",
            "instant",
            "localdate",
            "localtime",
            "datetime",
        }
        datetime_count = sum(1 for p in datetime_patterns if p in code_lower)
        features.append(min(datetime_count / 3.0, 1.0))

        # Serialization
        serialization_patterns = {
            "serialize",
            "deserialize",
            "parse",
            "format",
            "tostring",
            "fromstring",
        }
        serialization_count = sum(1 for p in serialization_patterns if p in code_lower)
        features.append(min(serialization_count / 3.0, 1.0))

        return features

    def _generate_feature_names(self) -> list[str]:
        """Generate names for all features."""
        names = []

        # Traditional feature names
        names.append("loc")
        for category in self.KEYWORD_CATEGORIES:
            names.append(f"keyword_{category}")

        # CST feature names
        for node_type in self.CST_NODE_TYPES:
            names.append(f"cst_{node_type}")

        # Semantic feature names
        for rel_type in self.RELATIONSHIP_TYPES:
            names.append(f"semantic_{rel_type}")

        # Depth feature names
        depth_names = [
            "max_depth",
            "avg_depth",
            "leaf_internal_ratio",
            "control_depth",
            "block_nesting",
            "stmt_density",
            "cyclomatic_estimate",
            "branching_factor",
        ]
        names.extend(depth_names)

        # Type signature feature names
        for pattern in self.TYPE_PATTERNS:
            names.append(f"type_{pattern}")

        # API fingerprinting feature names
        for pattern in self.API_PATTERNS:
            names.append(f"api_{pattern}")

        return names

    def get_feature_names(self, fused: bool = False) -> list[str]:
        """
        Get feature names.

        Args:
            fused: If True, return names for fused features (with _1 and _2 suffixes)

        Returns:
            List of feature names
        """
        if fused:
            names1 = [f"{n}_1" for n in self.feature_names]
            names2 = [f"{n}_2" for n in self.feature_names]
            return names1 + names2

        return self.feature_names.copy()

    def get_feature_count(self, fused: bool = False) -> int:
        """
        Get the total number of features.

        Args:
            fused: If True, return count for fused features

        Returns:
            Number of features
        """
        if fused:
            return self.n_fused_features
        return self.n_features_per_code


class FeatureFusion:
    """
    Feature fusion strategies for combining multiple feature types.

    Supports:
    - Linear Combination (concatenation)
    - Weighted Sum
    - Feature Selection
    """

    @staticmethod
    def linear_combination(*feature_arrays: np.ndarray) -> np.ndarray:
        """
        Concatenate feature arrays (linear combination).

        This preserves original feature values and is optimal for
        tree-ensemble models like XGBoost.

        Args:
            *feature_arrays: Variable number of feature arrays

        Returns:
            Concatenated feature vector
        """
        return np.concatenate([arr.flatten() for arr in feature_arrays])

    @staticmethod
    def weighted_sum(
        *feature_arrays: np.ndarray, weights: Optional[list[float]] = None
    ) -> np.ndarray:
        """
        Compute weighted sum of feature arrays.

        Args:
            *feature_arrays: Variable number of feature arrays
            weights: Optional weights for each feature array

        Returns:
            Weighted sum of features
        """
        if weights is None:
            weights = [1.0] * len(feature_arrays)

        if len(weights) != len(feature_arrays):
            raise ValueError("Number of weights must match number of feature arrays")

        result = np.zeros_like(feature_arrays[0])
        for arr, weight in zip(feature_arrays, weights):
            result += weight * arr.flatten()

        return result

    @staticmethod
    def normalize_features(features: np.ndarray, method: str = "zscore") -> np.ndarray:
        """
        Normalize features for ML model input.

        Args:
            features: Feature array of shape (n_samples, n_features)
            method: Normalization method ('zscore', 'minmax', 'robust')

        Returns:
            Normalized features
        """
        if method == "zscore":
            mean = np.mean(features, axis=0)
            std = np.std(features, axis=0)
            std[std == 0] = 1  # Avoid division by zero
            return (features - mean) / std

        elif method == "minmax":
            min_val = np.min(features, axis=0)
            max_val = np.max(features, axis=0)
            range_val = max_val - min_val
            range_val[range_val == 0] = 1
            return (features - min_val) / range_val

        elif method == "robust":
            median = np.median(features, axis=0)
            q1 = np.percentile(features, 25, axis=0)
            q3 = np.percentile(features, 75, axis=0)
            iqr = q3 - q1
            iqr[iqr == 0] = 1
            return (features - median) / iqr

        else:
            raise ValueError(f"Unknown normalization method: {method}")
