"""
Sheneamer et al. (2021) Type-IV Code Clone Detection Features.

This module implements the feature extraction framework from the paper:
"An Effective Semantic Code Clone Detection Framework Using Pairwise Feature Fusion"
by Sheneamer et al. (2021), IEEE Access.

Feature Categories (101 features per code snippet):
1. Traditional Features (11): LOC, keyword counts, complexity metrics
2. Syntactic/CST Features (40): Frequency of CST non-leaf nodes via post-order traversal
3. Semantic/PDG Features (20): Implicit Program Dependency Graph features
4. Structural Depth Features (15): Nesting, depth, density patterns
5. Type Signature Features (10): Parameter/return type patterns
6. API Fingerprinting Features (5): Library usage patterns

Feature Fusion (Enhanced with Contrastive Features):
- Concatenation: [f1, f2] (original)
- Absolute Difference: |f1 - f2| (structural divergence)
- Element-wise Product: f1 ∘ f2 (shared features)
- Cosine Similarity (per category): 6 features
- Euclidean Distance: 1 feature
Total fused features: 101*2 + 101 + 101 + 6 + 1 = 310 features
"""

import re
from collections import defaultdict
from typing import Optional

import numpy as np

from ..tokenizers.tree_sitter_tokenizer import TreeSitterTokenizer


class SheneamerFeatureExtractor:
    """
    Feature extractor based on Sheneamer et al. (2021) framework.

    Extracts 100 features per code snippet across six categories:
    - Traditional: LOC, keyword categories, complexity
    - Syntactic (CST): Non-leaf node frequencies via post-order traversal
    - Semantic (PDG-like): Control and data dependency patterns
    - Structural Depth: Nesting patterns, density metrics
    - Type Signatures: Parameter and return type encodings
    - API Fingerprinting: Library and framework usage patterns

    Feature fusion uses linear combination (concatenation) for pairwise comparison.
    """

    # ========================================================================
    # TRADITIONAL FEATURES (10)
    # ========================================================================

    KEYWORD_CATEGORIES = {
        "control_flow": {
            "if",
            "else",
            "switch",
            "case",
            "default",
            "for",
            "while",
            "do",
            "break",
            "continue",
            "return",
            "goto",
        },
        "exception_handling": {
            "try",
            "catch",
            "finally",
            "throw",
            "throws",
            "except",
            "raise",
            "assert",
        },
        "declarations": {
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
            "volatile",
            "extern",
        },
        "access_modifiers": {"public", "private", "protected", "internal"},
        "oop_keywords": {
            "class",
            "interface",
            "extends",
            "implements",
            "abstract",
            "final",
            "new",
            "this",
            "super",
            "instanceof",
        },
        "memory_management": {
            "new",
            "delete",
            "malloc",
            "free",
            "calloc",
            "realloc",
            "sizeof",
            "alloc",
        },
        "io_operations": {
            "print",
            "println",
            "printf",
            "scanf",
            "read",
            "write",
            "input",
            "output",
            "fopen",
            "fclose",
        },
        "import_export": {
            "import",
            "from",
            "include",
            "require",
            "using",
            "package",
            "namespace",
            "export",
        },
        "concurrency": {
            "thread",
            "synchronized",
            "async",
            "await",
            "parallel",
            "mutex",
            "lock",
            "spawn",
        },
        "lambda_functional": {
            "lambda",
            "yield",
            "fun",
            "function",
            "arrow",
            "stream",
            "map",
            "filter",
            "reduce",
        },
    }

    # ========================================================================
    # SYNTACTIC/CST FEATURES (40) - Non-leaf nodes via post-order traversal
    # ========================================================================

    CST_NON_LEAF_NODES = [
        # Control structures
        "if_statement",
        "else_clause",
        "for_statement",
        "while_statement",
        "do_statement",
        "switch_statement",
        "case_clause",
        "break_statement",
        "continue_statement",
        "return_statement",
        # Exception handling
        "try_statement",
        "catch_clause",
        "finally_clause",
        "throw_statement",
        # Declarations and definitions
        "function_definition",
        "method_declaration",
        "class_definition",
        "class_declaration",
        "interface_declaration",
        "variable_declaration",
        "field_declaration",
        "parameter_list",
        # Expressions
        "assignment_expression",
        "binary_expression",
        "unary_expression",
        "ternary_expression",
        "update_expression",
        "method_invocation",
        "call_expression",
        "member_expression",
        "subscript_expression",
        "lambda_expression",
        # Composite structures
        "block",
        "statement_block",
        "expression_statement",
        "argument_list",
        "array_creation",
        "initializer_list",
        "structured_value",
        # Special constructs
        "decorated_definition",
        "with_statement",
        "yield_statement",
        "assert_statement",
        "import_statement",
        "using_declaration",
        "namespace_definition",
        "template_declaration",
        "type_cast",
    ]

    # ========================================================================
    # SEMANTIC/PDG FEATURES (20) - Implicit Program Dependency Graph
    # ========================================================================

    PDG_RELATIONSHIP_TYPES = [
        # Control dependencies
        "control_construct",
        "conditional_branch",
        "loop_construct",
        "switch_branch",
        "exception_flow",
        # Data dependencies
        "assignment",
        "variable_read",
        "variable_write",
        "data_flow",
        "parameter_passing",
        # Function-level dependencies
        "function_call",
        "function_return",
        "recursive_call",
        "method_call",
        "constructor_call",
        # Operation dependencies
        "binary_operation",
        "unary_operation",
        "array_access",
        "field_access",
        "pointer_dereference",
    ]

    # ========================================================================
    # STRUCTURAL DEPTH FEATURES (15)
    # ========================================================================

    DEPTH_FEATURE_NAMES = [
        "max_cst_depth",
        "avg_cst_depth",
        "leaf_to_internal_ratio",
        "max_control_nesting",
        "max_block_nesting",
        "statement_density",
        "cyclomatic_complexity",
        "branching_factor_avg",
        "branching_factor_max",
        "function_length_norm",
        "parameter_count",
        "local_var_count",
        "expression_depth_avg",
        "control_path_count",
        "scope_depth_max",
    ]

    # ========================================================================
    # TYPE SIGNATURE FEATURES (10)
    # ========================================================================

    TYPE_SIGNATURE_PATTERNS = [
        "primitive_return",
        "void_return",
        "object_return",
        "array_return",
        "generic_return",
        "no_parameters",
        "single_parameter",
        "multi_parameters",
        "varargs",
        "constructor_pattern",
    ]

    # ========================================================================
    # API FINGERPRINTING FEATURES (5)
    # ========================================================================

    API_FINGERPRINT_CATEGORIES = [
        "math_computation",
        "string_manipulation",
        "collection_operations",
        "io_file_operations",
        "network_system_calls",
    ]

    def __init__(
        self,
        tokenizer: Optional[TreeSitterTokenizer] = None,
    ):
        """
        Initialize the Sheneamer feature extractor.

        Args:
            tokenizer: TreeSitterTokenizer instance (created if not provided)
        """
        self.tokenizer = tokenizer or TreeSitterTokenizer()

        # Feature counts per category
        self.n_traditional = 1 + len(
            self.KEYWORD_CATEGORIES
        )  # LOC + 10 categories = 11
        self.n_cst = len(self.CST_NON_LEAF_NODES)  # 40
        self.n_semantic = len(self.PDG_RELATIONSHIP_TYPES)  # 20
        self.n_depth = len(self.DEPTH_FEATURE_NAMES)  # 15
        self.n_type = len(self.TYPE_SIGNATURE_PATTERNS)  # 10
        self.n_api = len(self.API_FINGERPRINT_CATEGORIES)  # 5

        # Total: 11 + 40 + 20 + 15 + 10 + 5 = 101 features per code
        self.n_features_per_code = (
            self.n_traditional
            + self.n_cst
            + self.n_semantic
            + self.n_depth
            + self.n_type
            + self.n_api
        )

        # Fused features with contrastive learning:
        # Absolute Diff (101) + Relative Diff (101) + Max-Min Ratio (101) +
        # Interaction (101) + Cosine Similarity (1) = 405 features
        self.n_fused_features = self.n_features_per_code * 4 + 1  # 405 features

        # Generate feature names for contrastive features
        self.feature_names = self._generate_feature_names()

    def extract_features(self, code: str, language: str = "java") -> np.ndarray:
        """
        Extract all 100 features from a single code snippet.

        Args:
            code: Source code string
            language: Programming language ('java', 'c', 'cpp', 'python')

        Returns:
            Numpy array of shape (n_features_per_code,)
        """
        features = []

        # 1. Traditional features (11)
        traditional = self._extract_traditional_features(code)
        features.extend(traditional)

        # 2. Syntactic/CST features (40)
        cst_features = self._extract_cst_features(code, language)
        features.extend(cst_features)

        # 3. Semantic/PDG features (20)
        semantic_features = self._extract_semantic_features(code, language)
        features.extend(semantic_features)

        # 4. Structural depth features (15)
        depth_features = self._extract_depth_features(code, language)
        features.extend(depth_features)

        # 5. Type signature features (10)
        type_features = self._extract_type_features(code)
        features.extend(type_features)

        # 6. API fingerprinting features (5)
        api_features = self._extract_api_features(code)
        features.extend(api_features)

        return np.array(features, dtype=np.float64)

    def extract_fused_features(
        self, code1: str, code2: str, language: str = "java"
    ) -> np.ndarray:
        """
        Extract and fuse features from two code snippets using contrastive learning.

        Contrastive fusion transforms the problem from "Identify if these are functions"
        to "Identify if the delta between these functions is small enough to be a clone."

        This implementation uses contrastive features designed to fix the "Clone Zealot"
        bias by explicitly encoding divergence signals:

        Fusion components (total: 405 features):
        1. Absolute Difference: |f1 - f2| (101 features) - Core signal for divergence
        2. Relative Difference: |f1 - f2| / (f1 + f2 + ε) (101 features) - Handles scaling
        3. Max-Min Ratio: min(f1, f2) / (max(f1, f2) + ε) (101 features) - Structural overlap
        4. Interaction Term: f1 · f2 (101 features) - Captures shared features
        5. Cosine Similarity: scalar (1 feature) - Overall semantic similarity

        Args:
            code1: First source code string
            code2: Second source code string
            language: Programming language

        Returns:
            Fused feature vector of shape (405,) - flat NumPy array
        """
        features1 = self.extract_features(code1, language)
        features2 = self.extract_features(code2, language)

        # Ensure float64 for numerical stability
        f1 = features1.astype(np.float64)
        f2 = features2.astype(np.float64)

        # Epsilon for numerical stability
        eps = 1e-6

        # 1. Absolute Difference (structural divergence)
        # High values indicate different features
        abs_diff = np.abs(f1 - f2)

        # 2. Relative Difference (scale-invariant divergence)
        # Handles scaling across languages and code lengths
        relative_diff = np.abs(f1 - f2) / (np.abs(f1) + np.abs(f2) + eps)

        # 3. Max-Min Ratio (structural overlap)
        # Values close to 1.0 indicate similar feature magnitudes
        min_vals = np.minimum(f1, f2)
        max_vals = np.maximum(f1, f2)
        max_min_ratio = min_vals / (max_vals + eps)

        # 4. Interaction Term (shared features)
        # High values when both features are present and strong
        interaction = f1 * f2

        # 5. Cosine Similarity (overall semantic similarity)
        # Single scalar representing global similarity
        dot_product = np.dot(f1, f2)
        norm_f1 = np.linalg.norm(f1)
        norm_f2 = np.linalg.norm(f2)

        if norm_f1 > 0 and norm_f2 > 0:
            cosine_similarity = np.array([dot_product / (norm_f1 * norm_f2)])
        else:
            cosine_similarity = np.array([0.0])

        # Concatenate all contrastive features
        # Total: 101 + 101 + 101 + 101 + 1 = 405 features
        fused = np.concatenate(
            [abs_diff, relative_diff, max_min_ratio, interaction, cosine_similarity]
        )

        return fused

    def _extract_traditional_features(self, code: str) -> list[float]:
        """
        Extract traditional code metrics (11 features).

        Features:
        - Lines of code (LOC) - length-normalized with log scaling
        - Keyword category counts (normalized by LOC)

        Returns:
            List of 11 traditional feature values
        """
        features = []

        # LOC with log scaling for length invariance
        loc = len(code.splitlines())
        loc_normalized = np.log1p(loc)  # log(1 + loc) to handle 0
        features.append(loc_normalized / 5.0)  # Normalize assuming max ~150 lines

        # Keyword category counts (density-based)
        code_lower = code.lower()
        tokens = set(re.findall(r"\b\w+\b", code_lower))

        for category, keywords in self.KEYWORD_CATEGORIES.items():
            count = len(tokens & keywords)
            # Density: count per line
            normalized = count / max(loc, 1)
            features.append(normalized)

        return features

    def _extract_cst_features(self, code: str, language: str) -> list[float]:
        """
        Extract syntactic features from Tree-sitter CST (40 features).

        Counts frequencies of non-leaf node types via post-order traversal.

        Multi-level normalization:
        - Uses density (count / total_nodes) instead of raw counts
        - Ensures length-invariant comparison

        Returns:
            List of 40 CST feature values (normalized densities)
        """
        try:
            frequencies = self._get_cst_frequencies_postorder(code, language)
        except Exception:
            return [0.0] * self.n_cst

        features = []
        total_nodes = sum(frequencies.values()) if frequencies else 1

        for node_type in self.CST_NON_LEAF_NODES:
            count = frequencies.get(node_type, 0)
            # CST Density: count per total nodes (length-invariant)
            density = count / max(total_nodes, 1)
            features.append(density)

        return features

    def _get_cst_frequencies_postorder(
        self, code: str, language: str
    ) -> dict[str, int]:
        """
        Extract CST non-leaf node frequencies using post-order traversal.

        Post-order traversal ensures children are processed before parents,
        capturing the hierarchical structure effectively.

        Returns:
            Dictionary of node type frequencies
        """
        if language not in self.tokenizer.parsers:
            # Handle C# by using C parser as fallback
            if language == "csharp" and "c" in self.tokenizer.parsers:
                language = "c"
            else:
                raise ValueError(f"Unsupported language: {language}")

        parser = self.tokenizer.parsers[language]

        try:
            code_bytes = code.encode("utf-8")
        except UnicodeEncodeError:
            code_bytes = code.encode("latin-1")

        tree = parser.parse(code_bytes)
        root_node = tree.root_node

        frequencies: dict[str, int] = defaultdict(int)

        def postorder_count(node):
            """Post-order traversal: process children first, then parent."""
            # Process all children first
            for child in node.children:
                postorder_count(child)

            # Then count non-leaf parent nodes
            if node.child_count > 0:
                frequencies[node.type] += 1

        postorder_count(root_node)
        return dict(frequencies)

    def _extract_semantic_features(self, code: str, language: str) -> list[float]:
        """
        Extract semantic (PDG-like) dependency features (20 features).

        Counts frequencies of implicit Program Dependency Graph relationships
        including control and data dependencies.

        Returns:
            List of 20 semantic feature values (normalized)
        """
        try:
            relationships = self._extract_pdg_relationships(code, language)
        except Exception:
            return [0.0] * self.n_semantic

        features = []
        total_rels = sum(relationships.values()) if relationships else 1

        for rel_type in self.PDG_RELATIONSHIP_TYPES:
            count = relationships.get(rel_type, 0)
            normalized = count / max(total_rels, 1)
            features.append(normalized)

        return features

    def _extract_pdg_relationships(self, code: str, language: str) -> dict[str, int]:
        """
        Extract implicit PDG relationships from code.

        Analyzes control and data dependencies that approximate a Program
        Dependency Graph without explicit graph construction.

        Returns:
            Dictionary of relationship type counts
        """
        if language not in self.tokenizer.parsers:
            if language == "csharp" and "c" in self.tokenizer.parsers:
                language = "c"
            else:
                raise ValueError(f"Unsupported language: {language}")

        parser = self.tokenizer.parsers[language]

        try:
            code_bytes = code.encode("utf-8")
        except UnicodeEncodeError:
            code_bytes = code.encode("latin-1")

        tree = parser.parse(code_bytes)
        root_node = tree.root_node

        relationships: dict[str, int] = defaultdict(int)

        def extract_deps(node, code_bytes: bytes):
            """Extract dependencies from CST node."""
            node_type = node.type

            # Control dependencies
            if node_type in {
                "if_statement",
                "if",
                "conditional",
            }:
                relationships["control_construct"] += 1
                relationships["conditional_branch"] += 1

            if node_type in {"for_statement", "for", "while_statement", "while", "do"}:
                relationships["control_construct"] += 1
                relationships["loop_construct"] += 1

            if node_type == "switch_statement":
                relationships["control_construct"] += 1
                relationships["switch_branch"] += 1

            if node_type in {"try_statement", "catch_clause", "except_clause"}:
                relationships["exception_flow"] += 1

            # Data dependencies
            if node_type in {
                "variable_declaration",
                "assignment_expression",
                "augmented_assignment",
            }:
                relationships["assignment"] += 1
                relationships["variable_write"] += 1

            if (
                node_type == "identifier"
                and node.parent
                and node.parent.type
                not in {
                    "variable_declaration",
                    "assignment_expression",
                }
            ):
                relationships["variable_read"] += 1

            if node_type in {"method_invocation", "call_expression", "function_call"}:
                relationships["function_call"] += 1
                relationships["data_flow"] += 1

            if node_type == "return_statement":
                relationships["function_return"] += 1

            # Check for recursive calls (simplified heuristic)
            if node_type in {"method_invocation", "call_expression"}:
                # Would need symbol table for accurate detection
                relationships["recursive_call"] += 0  # Placeholder

            if node_type in {"constructor_invocation", "new_expression"}:
                relationships["constructor_call"] += 1

            # Operation dependencies
            if node_type == "binary_expression":
                relationships["binary_operation"] += 1

            if node_type == "unary_expression":
                relationships["unary_operation"] += 1

            if node_type in {"subscript_expression", "array_access"}:
                relationships["array_access"] += 1

            if node_type in {"member_expression", "field_access"}:
                relationships["field_access"] += 1

            if node_type in {"pointer_expression", "dereference"}:
                relationships["pointer_dereference"] += 1

            if node_type == "parameter_list":
                relationships["parameter_passing"] += 1

            # Recurse into children
            for child in node.children:
                extract_deps(child, code_bytes)

        extract_deps(root_node, code_bytes)
        return dict(relationships)

    def _extract_depth_features(self, code: str, language: str) -> list[float]:
        """
        Extract structural depth and nesting features (15 features).

        Returns:
            List of 15 depth feature values (normalized)
        """
        try:
            if language not in self.tokenizer.parsers:
                if language == "csharp" and "c" in self.tokenizer.parsers:
                    language = "c"
                else:
                    raise ValueError(f"Unsupported language: {language}")

            parser = self.tokenizer.parsers[language]
            code_bytes = code.encode("utf-8")
            tree = parser.parse(code_bytes)
            root_node = tree.root_node

            # Calculate all depth metrics
            max_depth = self._calculate_max_depth(root_node)
            avg_depth = self._calculate_avg_depth(root_node)
            leaf_count = self._count_leaf_nodes(root_node)
            internal_count = self._count_internal_nodes(root_node)
            control_depth = self._calculate_control_depth(root_node)
            block_nesting = self._calculate_block_nesting(root_node)
            stmt_density = self._calculate_statement_density(root_node, code)
            cyclomatic = self._estimate_cyclomatic_complexity(root_node)
            branch_avg, branch_max = self._calculate_branching_factor(root_node)
            func_length = self._estimate_function_length(root_node)
            param_count = self._count_parameters(root_node)
            local_vars = self._count_local_variables(root_node)
            expr_depth = self._calculate_expression_depth(root_node)
            control_paths = self._estimate_control_paths(root_node)
            scope_depth = self._calculate_scope_depth(root_node)

            loc = max(len(code.splitlines()), 1)

            return [
                max_depth / 20.0,  # Normalize assuming max depth ~20
                avg_depth / 20.0,
                leaf_count / max(leaf_count + internal_count, 1),
                control_depth / 10.0,
                block_nesting / 10.0,
                min(stmt_density, 1.0),
                min(cyclomatic / 20.0, 1.0),
                branch_avg / 5.0,
                branch_max / 10.0,
                min(func_length / 50.0, 1.0),
                min(param_count / 10.0, 1.0),
                min(local_vars / 20.0, 1.0),
                expr_depth / 10.0,
                min(control_paths / 100.0, 1.0),
                scope_depth / 10.0,
            ]

        except Exception:
            return [0.0] * self.n_depth

    def _calculate_max_depth(self, node, current_depth: int = 1) -> int:
        """Calculate maximum depth of CST."""
        if node.child_count == 0:
            return current_depth
        return max(
            self._calculate_max_depth(child, current_depth + 1)
            for child in node.children
        )

    def _calculate_avg_depth(self, node, current_depth: int = 1) -> float:
        """Calculate average depth of all nodes."""
        total_depth, count = self._sum_depths(node, current_depth)
        return total_depth / max(count, 1)

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
        """Count internal (non-leaf) nodes in CST."""
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
        if node.type in {"block", "statement_block"}:
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

        return stmt_count / loc

    def _estimate_cyclomatic_complexity(self, node) -> int:
        """Estimate cyclomatic complexity (decision points + 1)."""
        decision_types = {
            "if_statement",
            "for_statement",
            "while_statement",
            "case_clause",
            "catch_clause",
            "conditional_expression",
            "&&",
            "||",
            "and",
            "or",
        }

        count = self._count_node_types(node, decision_types)
        return count + 1

    def _calculate_branching_factor(self, node) -> tuple[float, int]:
        """Calculate average and maximum branching factor."""
        if node.child_count == 0:
            return 0.0, 0

        max_branch = node.child_count
        total_branch = node.child_count
        count = 1

        for child in node.children:
            child_avg, child_max = self._calculate_branching_factor(child)
            if child_avg > 0:
                total_branch += child_avg
                count += 1
            max_branch = max(max_branch, child_max)

        return total_branch / max(count, 1), max_branch

    def _estimate_function_length(self, node) -> int:
        """Estimate average function/method length."""
        func_types = {"function_definition", "method_declaration", "function"}

        func_nodes = self._collect_nodes(node, func_types)
        if not func_nodes:
            return 0

        total_lines = 0
        for func_node in func_nodes:
            # Estimate lines from node span
            start_line = func_node.start_point[0]
            end_line = func_node.end_point[0]
            total_lines += end_line - start_line + 1

        return total_lines // max(len(func_nodes), 1)

    def _count_parameters(self, node) -> int:
        """Count average parameters per function."""
        param_list_types = {"parameter_list", "parameters"}
        param_lists = self._collect_nodes(node, param_list_types)

        if not param_lists:
            return 0

        total_params = sum(pl.child_count for pl in param_lists)
        return total_params // max(len(param_lists), 1)

    def _count_local_variables(self, node) -> int:
        """Count local variable declarations."""
        var_types = {
            "variable_declaration",
            "local_variable_declaration",
            "let_binding",
        }
        return self._count_node_types(node, var_types)

    def _calculate_expression_depth(self, node) -> int:
        """Calculate average expression depth."""
        expr_types = {
            "binary_expression",
            "unary_expression",
            "call_expression",
            "member_expression",
        }

        def get_expr_depth(n, current=0):
            if n.type in expr_types:
                if n.child_count == 0:
                    return current + 1
                return max(get_expr_depth(c, current + 1) for c in n.children)
            if n.child_count == 0:
                return 0
            return max(get_expr_depth(c, current) for c in n.children)

        return get_expr_depth(node)

    def _estimate_control_paths(self, node) -> int:
        """Estimate number of control flow paths."""
        branch_types = {"if_statement", "case_clause", "catch_clause"}
        branch_count = self._count_node_types(node, branch_types)
        # Rough estimate: 2^branch_count (simplified)
        return min(2**branch_count, 1000)

    def _calculate_scope_depth(self, node) -> int:
        """Calculate maximum scope nesting depth."""
        scope_types = {"block", "function_definition", "class_definition"}

        def get_scope_depth(n, current=0):
            if n.type in scope_types:
                if n.child_count == 0:
                    return current + 1
                return max(get_scope_depth(c, current + 1) for c in n.children)
            if n.child_count == 0:
                return current
            return max(get_scope_depth(c, current) for c in n.children)

        return get_scope_depth(node)

    def _count_node_types(self, node, types: set) -> int:
        """Count nodes of specified types."""
        count = 1 if node.type in types else 0
        for child in node.children:
            count += self._count_node_types(child, types)
        return count

    def _collect_nodes(self, node, types: set) -> list:
        """Collect all nodes of specified types."""
        nodes = []
        if node.type in types:
            nodes.append(node)
        for child in node.children:
            nodes.extend(self._collect_nodes(child, types))
        return nodes

    def _extract_type_features(self, code: str) -> list[float]:
        """
        Extract type signature features (10 features).

        Analyzes return types and parameter patterns.

        Returns:
            List of 10 type feature values (normalized)
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
        }
        primitive_count = sum(
            1 for p in primitives if re.search(rf"\b{p}\b", code_lower)
        )
        features.append(min(primitive_count / 5.0, 1.0))

        # Void return
        features.append(1.0 if "void" in code_lower else 0.0)

        # Object return
        object_patterns = {
            "object",
            "string",
            "list",
            "dict",
            "map",
            "set",
            "array",
            "vector",
        }
        object_count = sum(1 for p in object_patterns if p in code_lower)
        features.append(min(object_count / 3.0, 1.0))

        # Array return
        array_indicators = code.count("[]") + code.count("Array") + code.count("array")
        features.append(min(array_indicators / 3.0, 1.0))

        # Generic return
        generic_count = code.count("<") + code.count(">")
        features.append(min(generic_count / 6.0, 1.0))

        # Parameter patterns
        param_count = code.count("(") - code.count("()")
        features.append(1.0 if param_count == 0 else 0.0)  # No parameters
        features.append(1.0 if param_count == 1 else 0.0)  # Single parameter
        features.append(1.0 if param_count > 1 else 0.0)  # Multiple parameters

        # Varargs
        features.append(1.0 if "..." in code or "..." in code else 0.0)

        # Constructor pattern
        is_constructor = (
            1.0
            if re.search(r"public\s+\w+\s*\([^)]*\)\s*\{", code)
            or re.search(r"def\s+__init__\s*\(", code)
            else 0.0
        )
        features.append(is_constructor)

        return features

    def _extract_api_features(self, code: str) -> list[float]:
        """
        Extract API fingerprinting features (5 features).

        Analyzes patterns of API calls and library usage.

        Returns:
            List of 5 API feature values (normalized)
        """
        features = []
        code_lower = code.lower()

        # Math computation
        math_patterns = {
            "math.",
            "sqrt",
            "pow",
            "abs",
            "sin",
            "cos",
            "log",
            "exp",
            "round",
            "numpy",
            "np.",
        }
        math_count = sum(1 for p in math_patterns if p in code_lower)
        features.append(min(math_count / 3.0, 1.0))

        # String manipulation
        string_patterns = {
            "length",
            "substring",
            "split",
            "replace",
            "trim",
            "upper",
            "lower",
            "concat",
            "string.",
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
            "append",
            "insert",
            "delete",
            "list.",
            "dict.",
            "set.",
        }
        collection_count = sum(1 for p in collection_patterns if p in code_lower)
        features.append(min(collection_count / 3.0, 1.0))

        # I/O and file operations
        io_patterns = {
            "read",
            "write",
            "print",
            "file",
            "open",
            "close",
            "stream",
            "input",
            "output",
        }
        io_count = sum(1 for p in io_patterns if p in code_lower)
        features.append(min(io_count / 3.0, 1.0))

        # Network and system calls
        network_patterns = {
            "connect",
            "send",
            "receive",
            "socket",
            "http",
            "request",
            "response",
            "tcp",
            "udp",
        }
        network_count = sum(1 for p in network_patterns if p in code_lower)
        features.append(min(network_count / 3.0, 1.0))

        return features

    def _generate_feature_names(self) -> list[str]:
        """Generate names for all features including contrastive fusion features."""
        base_names = []

        # Traditional feature names
        base_names.append("loc")
        for category in self.KEYWORD_CATEGORIES:
            base_names.append(f"keyword_{category}")

        # CST feature names
        for node_type in self.CST_NON_LEAF_NODES:
            base_names.append(f"cst_{node_type}")

        # Semantic/PDG feature names
        for rel_type in self.PDG_RELATIONSHIP_TYPES:
            base_names.append(f"pdg_{rel_type}")

        # Depth feature names
        base_names.extend(self.DEPTH_FEATURE_NAMES)

        # Type signature feature names
        for pattern in self.TYPE_SIGNATURE_PATTERNS:
            base_names.append(f"type_{pattern}")

        # API fingerprinting feature names
        for pattern in self.API_FINGERPRINT_CATEGORIES:
            base_names.append(f"api_{pattern}")

        # Generate names for contrastive fusion components
        # 1. Absolute difference features
        abs_diff_names = [f"abs_diff_{n}" for n in base_names]

        # 2. Relative difference features
        rel_diff_names = [f"rel_diff_{n}" for n in base_names]

        # 3. Max-min ratio features
        max_min_names = [f"max_min_ratio_{n}" for n in base_names]

        # 4. Interaction term features
        interaction_names = [f"interaction_{n}" for n in base_names]

        # 5. Cosine similarity (single scalar)
        cosine_name = ["cosine_similarity_global"]

        # Combine all names (405 total)
        all_names = (
            abs_diff_names
            + rel_diff_names
            + max_min_names
            + interaction_names
            + cosine_name
        )

        return all_names

    def get_feature_names(self, fused: bool = False) -> list[str]:
        """
        Get feature names.

        Args:
            fused: If True, return names for fused contrastive features.

        Returns:
            List of feature names
        """
        if fused:
            return self.feature_names
        return self.feature_names[: self.n_features_per_code]

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


def get_feature_extractor() -> SheneamerFeatureExtractor:
    """Get a singleton instance of the feature extractor."""
    if not hasattr(get_feature_extractor, "_instance"):
        get_feature_extractor._instance = SheneamerFeatureExtractor()
    return get_feature_extractor._instance
