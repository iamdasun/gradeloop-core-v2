"""
Tree-sitter based Tokenizer for Multi-Language Code Parsing.

This module provides a unified interface for tokenizing source code in Java, C, and Python
using Tree-sitter Concrete Syntax Trees (CSTs). It supports:
- Lexical analysis with token sequence extraction
- Variable name abstraction to 'V' for Type-2 clone handling
- Token-to-type conversion using 15 standardized token types
"""

import re
from typing import Optional

import tree_sitter_c as tsc
import tree_sitter_java as tsjava
import tree_sitter_python as tspython
from tree_sitter import Language, Parser

from ..utils.common_setup import abstract_identifier, get_parsers_dir, get_token_type


class TreeSitterTokenizer:
    """
    Multi-language tokenizer using Tree-sitter CST parsing.

    Supports Java, C, and Python with consistent token type mapping.
    """

    def __init__(self):
        """Initialize the tokenizer with Tree-sitter parsers."""
        self.parsers = {}
        self._load_parsers()

    def _load_parsers(self) -> None:
        """Load Tree-sitter language parsers."""
        # Try to load from pip-installed packages
        try:
            # Modern tree-sitter API: wrap PyCapsule in Language, then create Parser
            self.parsers["java"] = Parser(Language(tsjava.language()))
            self.parsers["c"] = Parser(Language(tsc.language()))
            self.parsers["python"] = Parser(Language(tspython.language()))

        except ImportError as e:
            raise ImportError(
                "Tree-sitter language packages not found. "
                "Install them with: pip install tree-sitter-java tree-sitter-c tree-sitter-python"
            ) from e

        # Optional: C# support via tree-sitter-c-sharp
        try:
            import tree_sitter_c_sharp as tscsharp  # type: ignore[import]
            self.parsers["csharp"] = Parser(Language(tscsharp.language()))
            self.parsers["c#"] = self.parsers["csharp"]
        except (ImportError, Exception):
            pass  # C# support is optional; preprocessor falls back to regex

    def tokenize(
        self,
        code: str,
        language: str,
        abstract_identifiers: bool = True,
        include_types: bool = False,
    ) -> list[str]:
        """
        Tokenize source code using Tree-sitter CST.

        Args:
            code: Source code string
            language: Programming language ('java', 'c', 'python')
            abstract_identifiers: If True, replace variable names with 'V'
            include_types: If True, return token types instead of tokens

        Returns:
            List of tokens (or token types)
        """
        if language not in self.parsers:
            raise ValueError(
                f"Unsupported language: {language}. Supported: {list(self.parsers.keys())}"
            )

        # Parse the code
        parser = self.parsers[language]

        # Handle encoding issues
        try:
            code_bytes = code.encode("utf-8")
        except UnicodeEncodeError:
            code_bytes = code.encode("latin-1")

        tree = parser.parse(code_bytes)
        root_node = tree.root_node

        # Extract tokens from CST
        tokens = self._extract_tokens(root_node, code_bytes)

        # Process tokens
        if include_types:
            return [get_token_type(token) for token in tokens]
        elif abstract_identifiers:
            return [abstract_identifier(token) for token in tokens]
        else:
            return tokens

    def _extract_tokens(self, node, code_bytes: bytes) -> list[str]:
        """
        Recursively extract tokens from a Tree-sitter CST node.

        Args:
            node: Tree-sitter node
            code_bytes: Original code as bytes

        Returns:
            List of token strings
        """
        tokens = []

        # Skip certain node types (comments, string literals content, etc.)
        skip_types = {
            "comment",
            "line_comment",
            "block_comment",
            "string_literal",
            "character_literal",
            "multiline_string",
            "string_content",
        }

        # Process the node
        if node.child_count == 0:
            # Leaf node - extract the text
            text = code_bytes[node.start_byte : node.end_byte].decode(
                "utf-8", errors="ignore"
            )

            # Skip whitespace-only tokens
            if text.strip():
                # Further tokenize by splitting on operators and delimiters
                sub_tokens = self._split_token(text)
                tokens.extend(sub_tokens)
        else:
            # Internal node - process children
            # But first check if this is a node type we should skip
            if node.type not in skip_types:
                for child in node.children:
                    tokens.extend(self._extract_tokens(child, code_bytes))

        return tokens

    def _split_token(self, text: str) -> list[str]:
        """
        Split a token into sub-tokens (operators, delimiters, identifiers).

        Args:
            text: Token text

        Returns:
            List of sub-tokens
        """
        # Pattern to split on operators and delimiters while keeping them
        pattern = r"([+\-*/%=<>!&|^~?:;,.\[\]{}()])"
        parts = re.split(pattern, text)

        # Filter out empty strings and whitespace
        tokens = [p.strip() for p in parts if p and p.strip()]

        return tokens

    def get_cst_frequencies(self, code: str, language: str) -> dict[str, int]:
        """
        Extract frequency counts of CST node types from source code.

        This is used for syntactic feature extraction in Pipeline B.

        Args:
            code: Source code string
            language: Programming language

        Returns:
            Dictionary mapping node types to their frequencies
        """
        if language not in self.parsers:
            raise ValueError(f"Unsupported language: {language}")

        parser = self.parsers[language]

        try:
            code_bytes = code.encode("utf-8")
        except UnicodeEncodeError:
            code_bytes = code.encode("latin-1")

        tree = parser.parse(code_bytes)
        root_node = tree.root_node

        frequencies = {}
        self._count_node_types(root_node, frequencies)

        return frequencies

    def _count_node_types(self, node, frequencies: dict[str, int]) -> None:
        """
        Recursively count node type frequencies in the CST.

        Args:
            node: Tree-sitter node
            frequencies: Dictionary to store counts
        """
        # Count non-leaf nodes (syntactic constructs)
        if node.child_count > 0:
            node_type = node.type
            frequencies[node_type] = frequencies.get(node_type, 0) + 1

            # Process children
            for child in node.children:
                self._count_node_types(child, frequencies)

    def get_dependency_relationships(self, code: str, language: str) -> dict[str, int]:
        """
        Extract semantic dependency relationships from code.

        This approximates PDG-like features by counting:
        - Variable declarations followed by assignments
        - Function calls within control structures
        - Data flow patterns

        Args:
            code: Source code string
            language: Programming language

        Returns:
            Dictionary mapping relationship types to frequencies
        """
        if language not in self.parsers:
            raise ValueError(f"Unsupported language: {language}")

        parser = self.parsers[language]

        try:
            code_bytes = code.encode("utf-8")
        except UnicodeEncodeError:
            code_bytes = code.encode("latin-1")

        tree = parser.parse(code_bytes)
        root_node = tree.root_node

        relationships = {}
        self._extract_relationships(root_node, code_bytes, relationships)

        return relationships

    def _extract_relationships(
        self, node, code_bytes: bytes, relationships: dict[str, int]
    ) -> None:
        """
        Recursively extract dependency relationships from CST.

        Args:
            node: Tree-sitter node
            code_bytes: Original code as bytes
            relationships: Dictionary to store relationship counts
        """
        node_type = node.type

        # Count control flow constructs
        control_types = {
            "if_statement",
            "for_statement",
            "while_statement",
            "do_statement",
            "switch_statement",
            "try_statement",
            "if",
            "for",
            "while",
            "switch",
            "try",
        }

        if node_type in control_types:
            relationships["control_construct"] = (
                relationships.get("control_construct", 0) + 1
            )

        # Count assignment after declaration (data dependency)
        if node_type in {
            "variable_declaration",
            "local_variable_declaration",
            "assignment_expression",
        }:
            relationships["assignment"] = relationships.get("assignment", 0) + 1

        # Count function/method calls
        if node_type in {"method_invocation", "call_expression", "function_call"}:
            relationships["function_call"] = relationships.get("function_call", 0) + 1

        # Count return statements
        if node_type in {"return_statement", "return"}:
            relationships["return"] = relationships.get("return", 0) + 1

        # Count binary operations (data flow)
        if node_type in {"binary_expression", "assignment_expression"}:
            relationships["binary_operation"] = (
                relationships.get("binary_operation", 0) + 1
            )

        # Process children
        for child in node.children:
            self._extract_relationships(child, code_bytes, relationships)


def get_tokenizer() -> TreeSitterTokenizer:
    """Get a singleton instance of the tokenizer."""
    if not hasattr(get_tokenizer, "_instance"):
        get_tokenizer._instance = TreeSitterTokenizer()
    return get_tokenizer._instance
