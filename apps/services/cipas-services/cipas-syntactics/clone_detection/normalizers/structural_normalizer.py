"""
NiCad-Style Structural Normalizer for Type-1 and Type-2 Clone Detection.

This module implements a tiered detection strategy using Tree-sitter CST:
- Pass A (Literal): Normalized CST comparison without renaming (Type-1, threshold >= 0.98)
- Pass B (Blinded): Identifier and literal blinding (Type-2, threshold >= 0.95)

Features:
- Pretty printing: one statement per line, standardized spacing
- Removal of all comments and metadata
- Identifier and literal abstraction for Type-2 detection
"""

import re
from dataclasses import dataclass
from enum import Enum
from typing import Optional

import tree_sitter_c as tsc
import tree_sitter_java as tsjava
import tree_sitter_python as tspython
from tree_sitter import Language, Parser

from ..utils.common_setup import abstract_identifier, get_token_type


class NormalizationLevel(Enum):
    """Normalization level for clone detection."""

    LITERAL = "Literal"  # No abstraction, exact comparison
    BLINDED = "Blinded"  # Identifiers and literals abstracted
    TOKEN_BASED = "Token-based"  # TOMA token sequence


@dataclass
class NormalizationResult:
    """Result of code normalization."""

    normalized_code: str
    token_stream: list[str]
    level: NormalizationLevel
    jaccard_similarity: Optional[float] = None
    levenshtein_ratio: Optional[float] = None


class StructuralNormalizer:
    """
    NiCad-style structural normalizer using Tree-sitter CST.

    Implements pretty-printing normalization for Type-1/Type-2 clone detection:
    - One statement per line
    - Standardized spacing
    - Comment and metadata removal
    """

    # Thresholds for clone classification
    TYPE_1_JACCARD_THRESHOLD = 0.98
    TYPE_1_LEVENSHTEIN_THRESHOLD = 0.98
    TYPE_2_THRESHOLD = 0.95

    def __init__(self):
        """Initialize the normalizer with Tree-sitter parsers."""
        self.parsers = {}
        self._load_parsers()

    def _load_parsers(self) -> None:
        """Load Tree-sitter language parsers."""
        try:
            self.parsers["java"] = Parser(Language(tsjava.language()))
            self.parsers["c"] = Parser(Language(tsc.language()))
            self.parsers["python"] = Parser(Language(tspython.language()))
        except ImportError as e:
            raise ImportError(
                "Tree-sitter language packages not found. "
                "Install them with: pip install tree-sitter-java tree-sitter-c tree-sitter-python"
            ) from e

    def normalize(
        self,
        code: str,
        language: str,
        level: NormalizationLevel = NormalizationLevel.LITERAL,
    ) -> str:
        """
        Normalize source code using Tree-sitter CST parsing.

        Args:
            code: Source code string
            language: Programming language ('java', 'c', 'python')
            level: Normalization level (Literal or Blinded)

        Returns:
            Normalized code string with pretty-printing applied
        """
        if language not in self.parsers:
            raise ValueError(
                f"Unsupported language: {language}. Supported: {list(self.parsers.keys())}"
            )

        parser = self.parsers[language]

        # Handle encoding issues
        try:
            code_bytes = code.encode("utf-8")
        except UnicodeEncodeError:
            code_bytes = code.encode("latin-1")

        tree = parser.parse(code_bytes)
        root_node = tree.root_node

        # Extract and normalize statements
        statements = self._extract_statements(root_node, code_bytes, language)

        # Pretty print: one statement per line, standardized spacing
        normalized = self._pretty_print(statements, level)

        return normalized

    def _extract_statements(self, node, code_bytes: bytes, language: str) -> list[str]:
        """
        Extract all statements from CST, removing comments and metadata.

        Args:
            node: Tree-sitter node
            code_bytes: Original code as bytes
            language: Programming language

        Returns:
            List of normalized statement strings
        """
        statements = []

        # Node types to skip (comments, metadata)
        skip_types = {
            "comment",
            "line_comment",
            "block_comment",
            "block_comment_content",
            "string_content",
            "multiline_string",
        }

        # Statement-like node types to extract
        statement_types = {
            "expression_statement",
            "declaration",
            "local_variable_declaration",
            "variable_declaration",
            "assignment_expression",
            "return_statement",
            "if_statement",
            "for_statement",
            "while_statement",
            "do_statement",
            "switch_statement",
            "break_statement",
            "continue_statement",
            "try_statement",
            "throw_statement",
            "method_declaration",
            "function_definition",
            "class_declaration",
            "interface_declaration",
            "import_declaration",
            "package_declaration",
            "enhanced_for_statement",
            "labeled_statement",
            "synchronized_statement",
            "assert_statement",
            "yield_statement",
            "with_statement",
            "match_statement",
        }

        if node.child_count == 0:
            # Leaf node
            if node.type not in skip_types:
                text = code_bytes[node.start_byte : node.end_byte].decode(
                    "utf-8", errors="ignore"
                )
                if text.strip():
                    statements.append(text.strip())
        else:
            # Internal node - check if it's a statement type
            if node.type in statement_types:
                # Extract the full statement text
                text = code_bytes[node.start_byte : node.end_byte].decode(
                    "utf-8", errors="ignore"
                )
                # Remove inline comments
                text = self._remove_inline_comments(text, language)
                if text.strip():
                    statements.append(text.strip())
            else:
                # Process children
                for child in node.children:
                    if child.type not in skip_types:
                        statements.extend(
                            self._extract_statements(child, code_bytes, language)
                        )

        return statements

    def _remove_inline_comments(self, text: str, language: str) -> str:
        """
        Remove inline comments from a statement.

        Args:
            text: Statement text
            language: Programming language

        Returns:
            Statement text without comments
        """
        # Remove single-line comments
        if language == "python":
            # Python: # comments (but not in strings)
            text = re.sub(r"\s+#.*$", "", text, flags=re.MULTILINE)
        else:
            # Java/C: // and /* */ comments
            text = re.sub(r"\s//.*$", "", text, flags=re.MULTILINE)
            text = re.sub(r"/\*.*?\*/", "", text, flags=re.DOTALL)

        # Remove annotations/decorators (metadata)
        if language == "python":
            text = re.sub(r"@\w+(?:\([^)]*\))?\s*", "", text)
        else:
            # Java annotations
            text = re.sub(r"@\w+(?:\([^)]*\))?(\s|$)", r"\1", text)

        return text.strip()

    def _pretty_print(self, statements: list[str], level: NormalizationLevel) -> str:
        """
        Pretty print statements with standardized formatting.

        Args:
            statements: List of statement strings
            level: Normalization level

        Returns:
            Pretty-printed code string
        """
        normalized_statements = []

        for stmt in statements:
            # Standardize spacing around operators
            normalized = self._standardize_spacing(stmt)

            # Apply blinding if requested
            if level == NormalizationLevel.BLINDED:
                normalized = self._blind_identifiers_and_literals(normalized)

            if normalized:
                normalized_statements.append(normalized)

        # One statement per line
        return "\n".join(normalized_statements)

    def _standardize_spacing(self, text: str) -> str:
        """
        Standardize spacing in code.

        Args:
            text: Code text

        Returns:
            Code with standardized spacing
        """
        # Standardize spacing around operators
        operators = [
            "=",
            "+",
            "-",
            "*",
            "/",
            "%",
            "==",
            "!=",
            "<=",
            ">=",
            "<",
            ">",
            "&&",
            "||",
            "&",
            "|",
            "^",
            "<<",
            ">>",
        ]

        for op in operators:
            # Avoid double spacing
            text = re.sub(rf"\s*{re.escape(op)}\s*", f" {op} ", text)

        # Standardize spacing around delimiters
        text = re.sub(r"\s*\(\s*", " ( ", text)
        text = re.sub(r"\s*\)\s*", " ) ", text)
        text = re.sub(r"\s*\{\s*", " { ", text)
        text = re.sub(r"\s*\}\s*", " } ", text)
        text = re.sub(r"\s*\[\s*", " [ ", text)
        text = re.sub(r"\s*\]\s*", " ] ", text)
        text = re.sub(r"\s*;\s*", " ; ", text)
        text = re.sub(r"\s*,\s*", " , ", text)

        # Collapse multiple spaces
        text = re.sub(r"\s+", " ", text)

        return text.strip()

    def _blind_identifiers_and_literals(self, text: str) -> str:
        """
        Replace identifiers and literals with generic tokens.

        Args:
            text: Code text

        Returns:
            Code with identifiers -> ID and literals -> LIT
        """
        # Keywords to preserve (language-agnostic core keywords)
        keywords = {
            "public",
            "private",
            "protected",
            "static",
            "final",
            "class",
            "interface",
            "enum",
            "extends",
            "implements",
            "new",
            "return",
            "if",
            "else",
            "for",
            "while",
            "do",
            "switch",
            "case",
            "break",
            "continue",
            "try",
            "catch",
            "finally",
            "throw",
            "throws",
            "void",
            "int",
            "float",
            "double",
            "char",
            "boolean",
            "byte",
            "short",
            "long",
            "true",
            "false",
            "null",
            "None",
            "True",
            "False",
            "def",
            "import",
            "from",
            "as",
            "with",
            "lambda",
            "yield",
            "async",
            "await",
            "const",
            "struct",
            "union",
            "typedef",
            "sizeof",
            "include",
            "using",
            "namespace",
            "template",
            "typename",
            "virtual",
            "override",
            "abstract",
            "synchronized",
            "volatile",
            "transient",
            "native",
            "assert",
            "instanceof",
            "super",
            "this",
            "self",
            "pass",
            "raise",
            "except",
            "in",
            "is",
            "not",
            "and",
            "or",
            "elif",
            "else:",
        }

        # Token types to preserve
        preserved = {
            "(",
            ")",
            "{",
            "}",
            "[",
            "]",
            ";",
            ",",
            ":",
            ".",
            "+",
            "-",
            "*",
            "/",
            "%",
            "=",
            "==",
            "!=",
            "<=",
            ">=",
            "<",
            ">",
            "&&",
            "||",
            "&",
            "|",
            "^",
            "~",
            "!",
            "++",
            "--",
            "+=",
            "-=",
            "*=",
            "/=",
            "...",
        }

        # Split into tokens
        tokens = re.findall(
            r'"[^"]*"|\'[^\']*\'|\b\w+\b|[+\-*/%=<>!&|^~?:;,\[\]{}().]+', text
        )

        blinded_tokens = []
        for token in tokens:
            # Preserve keywords and operators
            if token in keywords or token in preserved:
                blinded_tokens.append(token)
            # String literals -> LIT
            elif (token.startswith('"') and token.endswith('"')) or (
                token.startswith("'") and token.endswith("'")
            ):
                blinded_tokens.append("LIT")
            # Numeric literals -> LIT
            elif re.match(r"^-?\d+\.?\d*$", token):
                blinded_tokens.append("LIT")
            # Identifiers -> ID
            elif re.match(r"^\w+$", token) and token not in preserved:
                blinded_tokens.append("ID")
            else:
                blinded_tokens.append(token)

        return " ".join(blinded_tokens)

    def compare_literal(
        self, code1: str, code2: str, language: str
    ) -> tuple[float, float, str, str]:
        """
        Compare two code snippets at literal level (Pass A).

        Args:
            code1: First code snippet
            code2: Second code snippet
            language: Programming language

        Returns:
            Tuple of (jaccard_similarity, levenshtein_ratio, normalized1, normalized2)
        """
        # Normalize both codes
        norm1 = self.normalize(code1, language, NormalizationLevel.LITERAL)
        norm2 = self.normalize(code2, language, NormalizationLevel.LITERAL)

        # Get token streams
        tokens1 = norm1.split()
        tokens2 = norm2.split()

        # Calculate Jaccard similarity
        set1 = set(tokens1)
        set2 = set(tokens2)
        intersection = len(set1 & set2)
        union = len(set1 | set2)
        jaccard = intersection / union if union > 0 else 0.0

        # Calculate Levenshtein ratio
        lev_ratio = self._levenshtein_ratio(norm1, norm2)

        return jaccard, lev_ratio, norm1, norm2

    def compare_blinded(
        self, code1: str, code2: str, language: str
    ) -> tuple[float, float, str, str]:
        """
        Compare two code snippets at blinded level (Pass B).

        Args:
            code1: First code snippet
            code2: Second code snippet
            language: Programming language

        Returns:
            Tuple of (jaccard_similarity, levenshtein_ratio, blinded1, blinded2)
        """
        # Normalize both codes with blinding
        blind1 = self.normalize(code1, language, NormalizationLevel.BLINDED)
        blind2 = self.normalize(code2, language, NormalizationLevel.BLINDED)

        # Get token streams
        tokens1 = blind1.split()
        tokens2 = blind2.split()

        # Calculate Jaccard similarity
        set1 = set(tokens1)
        set2 = set(tokens2)
        intersection = len(set1 & set2)
        union = len(set1 | set2)
        jaccard = intersection / union if union > 0 else 0.0

        # Calculate Levenshtein ratio
        lev_ratio = self._levenshtein_ratio(blind1, blind2)

        return jaccard, lev_ratio, blind1, blind2

    def _levenshtein_ratio(self, s1: str, s2: str) -> float:
        """
        Calculate Levenshtein similarity ratio.

        Args:
            s1: First string
            s2: Second string

        Returns:
            Similarity ratio in [0, 1]
        """
        if not s1 and not s2:
            return 1.0
        if not s1 or not s2:
            return 0.0

        # Use rapidfuzz if available, otherwise fallback to simple implementation
        try:
            from rapidfuzz import fuzz

            return fuzz.ratio(s1, s2) / 100.0
        except ImportError:
            # Simple implementation
            distance = self._levenshtein_distance(s1, s2)
            max_len = max(len(s1), len(s2))
            return 1.0 - (distance / max_len)

    def _levenshtein_distance(self, s1: str, s2: str) -> int:
        """
        Calculate Levenshtein distance between two strings.

        Args:
            s1: First string
            s2: Second string

        Returns:
            Edit distance
        """
        if len(s1) < len(s2):
            return self._levenshtein_distance(s2, s1)

        if len(s2) == 0:
            return len(s1)

        previous_row = range(len(s2) + 1)
        for i, c1 in enumerate(s1):
            current_row = [i + 1]
            for j, c2 in enumerate(s2):
                insertions = previous_row[j + 1] + 1
                deletions = current_row[j] + 1
                substitutions = previous_row[j] + (c1 != c2)
                current_row.append(min(insertions, deletions, substitutions))
            previous_row = current_row

        return previous_row[-1]

    def detect_clone_type(
        self, code1: str, code2: str, language: str
    ) -> tuple[str, float, NormalizationLevel]:
        """
        Detect clone type using tiered detection strategy.

        Args:
            code1: First code snippet
            code2: Second code snippet
            language: Programming language

        Returns:
            Tuple of (clone_type, confidence, normalization_level)
        """
        # Pass A: Literal comparison (Type-1 detection)
        jaccard_lit, lev_lit, _, _ = self.compare_literal(code1, code2, language)

        if (
            jaccard_lit >= self.TYPE_1_JACCARD_THRESHOLD
            and lev_lit >= self.TYPE_1_LEVENSHTEIN_THRESHOLD
        ):
            return "Type-1", 1.0, NormalizationLevel.LITERAL

        # Pass B: Blinded comparison (Type-2 detection)
        jaccard_blind, lev_blind, _, _ = self.compare_blinded(code1, code2, language)

        # Use maximum of Jaccard and Levenshtein for Type-2 decision
        max_similarity = max(jaccard_blind, lev_blind)

        if max_similarity >= self.TYPE_2_THRESHOLD:
            # Confidence based on how close to perfect match
            confidence = 0.95 + (max_similarity - self.TYPE_2_THRESHOLD) * 0.1
            confidence = min(confidence, 0.99)  # Cap below Type-1
            return "Type-2", confidence, NormalizationLevel.BLINDED

        # Not Type-1 or Type-2, needs Type-3 analysis (TOMA)
        return "Type-3", 0.0, NormalizationLevel.TOKEN_BASED


def get_normalizer() -> StructuralNormalizer:
    """Get a singleton instance of the normalizer."""
    if not hasattr(get_normalizer, "_instance"):
        get_normalizer._instance = StructuralNormalizer()
    return get_normalizer._instance
