"""
Tree-sitter based Tokenizer for Multi-Language Code Parsing.

This module provides a unified interface for tokenizing source code in Java, C, C#, and Python
using Tree-sitter Concrete Syntax Trees (CSTs). It supports:
- Lexical analysis with token sequence extraction
- Variable name abstraction to 'V' for Type-2 clone handling
- Token-to-type conversion using 15 standardized token types
- CST frequency extraction via post-order traversal
- PDG-like dependency relationship extraction
"""

import re

try:
    import tree_sitter_c_sharp as tscs

    HAS_CSHARP = True
except ImportError:
    HAS_CSHARP = False
    tscs = None

import tree_sitter_c as tsc
import tree_sitter_java as tsjava
import tree_sitter_python as tspython
from tree_sitter import Language, Parser


class TreeSitterTokenizer:
    """
    Multi-language tokenizer using Tree-sitter CST parsing.

    Supports Java, C, C#, and Python with consistent token type mapping.
    """

    def __init__(self):
        """Initialize the tokenizer with Tree-sitter parsers."""
        self.parsers = {}
        self._load_parsers()

    def _load_parsers(self) -> None:
        """Load Tree-sitter language parsers."""
        try:
            self.parsers["java"] = Parser(Language(tsjava.language()))
            self.parsers["c"] = Parser(Language(tsc.language()))
            if HAS_CSHARP and tscs is not None:
                self.parsers["csharp"] = Parser(Language(tscs.language()))
            self.parsers["python"] = Parser(Language(tspython.language()))

        except ImportError as e:
            raise ImportError(
                "Tree-sitter language packages not found. "
                "Install them with: pip install tree-sitter-java tree-sitter-c tree-sitter-python"
            ) from e

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

        parser = self.parsers[language]

        try:
            code_bytes = code.encode("utf-8")
        except UnicodeEncodeError:
            code_bytes = code.encode("latin-1")

        tree = parser.parse(code_bytes)
        root_node = tree.root_node

        tokens = self._extract_tokens(root_node, code_bytes)

        if include_types:
            return [self._get_token_type(token) for token in tokens]
        elif abstract_identifiers:
            return [self._abstract_identifier(token) for token in tokens]
        else:
            return tokens

    def _extract_tokens(self, node, code_bytes: bytes) -> list[str]:
        """Recursively extract tokens from a Tree-sitter CST node."""
        tokens = []

        skip_types = {
            "comment",
            "line_comment",
            "block_comment",
            "string_literal",
            "character_literal",
            "multiline_string",
            "string_content",
        }

        if node.child_count == 0:
            text = code_bytes[node.start_byte : node.end_byte].decode(
                "utf-8", errors="ignore"
            )
            if text.strip():
                sub_tokens = self._split_token(text)
                tokens.extend(sub_tokens)
        else:
            if node.type not in skip_types:
                for child in node.children:
                    tokens.extend(self._extract_tokens(child, code_bytes))

        return tokens

    def _split_token(self, text: str) -> list[str]:
        """Split a token into sub-tokens (operators, delimiters, identifiers)."""
        pattern = r"([+\-*/%=<>!&|^~?:;,.\[\]{}()])"
        parts = re.split(pattern, text)
        tokens = [p.strip() for p in parts if p and p.strip()]
        return tokens

    def _get_token_type(self, token: str) -> str:
        """Get the type category for a token."""

        # Check for numbers
        try:
            float(token.replace("_", ""))
            return "NUMBER"
        except ValueError:
            pass

        # Check for strings (quoted)
        if (token.startswith('"') and token.endswith('"')) or (
            token.startswith("'") and token.endswith("'")
        ):
            return "STRING"

        # Check for comments
        if (
            token.startswith("//")
            or token.startswith("/*")
            or token.startswith("#")
            or token.startswith('"""')
        ):
            return "COMMENT"

        # Check for annotations
        if token.startswith("@"):
            return "ANNOTATION"

        # Default to identifier
        return "IDENTIFIER"

    def _abstract_identifier(self, token: str) -> str:
        """Abstract identifiers to generic 'V'."""
        token_type = self._get_token_type(token)
        if token_type == "IDENTIFIER":
            return "V"
        return token

    def get_cst_frequencies(self, code: str, language: str) -> dict[str, int]:
        """Extract frequency counts of CST node types from source code."""
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
        """Recursively count node type frequencies in the CST."""
        if node.child_count > 0:
            node_type = node.type
            frequencies[node_type] = frequencies.get(node_type, 0) + 1

            for child in node.children:
                self._count_node_types(child, frequencies)

    def get_dependency_relationships(self, code: str, language: str) -> dict[str, int]:
        """Extract semantic dependency relationships from code."""
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
        """Recursively extract dependency relationships from CST."""
        node_type = node.type

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

        if node_type in {
            "variable_declaration",
            "local_variable_declaration",
            "assignment_expression",
        }:
            relationships["assignment"] = relationships.get("assignment", 0) + 1

        if node_type in {"method_invocation", "call_expression", "function_call"}:
            relationships["function_call"] = relationships.get("function_call", 0) + 1

        if node_type in {"return_statement", "return"}:
            relationships["return"] = relationships.get("return", 0) + 1

        if node_type in {"binary_expression", "assignment_expression"}:
            relationships["binary_operation"] = (
                relationships.get("binary_operation", 0) + 1
            )

        for child in node.children:
            self._extract_relationships(child, code_bytes, relationships)


def get_tokenizer() -> TreeSitterTokenizer:
    """Get a singleton instance of the tokenizer."""
    if not hasattr(get_tokenizer, "_instance"):
        get_tokenizer._instance = TreeSitterTokenizer()
    return get_tokenizer._instance
