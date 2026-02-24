# gradeloop-core-v2/apps/services/cipas-service/src/cipas/parsing/c_parser.py
"""
C language parser backed by tree-sitter-languages.

Responsibilities:
  - Hold a single tree-sitter Parser (configured for C) and Language
    object, created once in __init__ and reused across all parse calls.
  - Define TSQuery strings for FUNCTION, CLASS (struct/union/typedef),
    and LOOP granules specific to the C grammar.
  - Execute those queries against a parsed Tree and return RawGranule instances.

C grammar notes (tree-sitter-languages grammar version ~0.20):
  - Functions are `function_definition` nodes.  The function name is nested
    inside the declarator chain:
        function_definition
          declarator: function_declarator
            declarator: identifier @name      ← simple functions
          OR
          declarator: pointer_declarator
            declarator: function_declarator
              declarator: identifier @name    ← pointer-returning functions e.g. int *foo()

    We handle both forms with two separate query patterns.

  - Structs and unions are `struct_specifier` / `union_specifier` nodes.
    Only named structs/unions WITH a body (field_declaration_list) are captured
    as @class granules — forward declarations without a body are skipped.
    This prevents capturing `struct Foo;` as a granule when the definition
    is in a different file.

  - typedef struct patterns produce a type_definition node wrapping the
    struct_specifier.  We capture the typedef name as @name when present.

  - C has three loop constructs:
      for_statement
      while_statement
      do_statement
    All three are captured as granule_type="loop".

  - C does NOT have classes in the OOP sense.  `struct` and `union` are the
    closest structural equivalents.  They are mapped to granule_type="class"
    for cross-language clone detection compatibility.

TSQuery capture convention (same as python_parser.py):
  @function / @class / @loop  — structural root capture
  @name                       — identifier capture

tree-sitter 0.20.x captures() returns List[Tuple[Node, str]].
Grouping logic is shared with python_parser._build_granules().
"""

from __future__ import annotations

from typing import Any, ClassVar

from cipas.parsing.base import GranuleSpan, LanguageParser, RawGranule
from cipas.parsing.python_parser import _build_granules, _dfs_node_types

# ---------------------------------------------------------------------------
# TSQuery definitions
# ---------------------------------------------------------------------------
# C grammar tree structure for functions:
#
#   function_definition
#     type: ...
#     declarator: function_declarator
#       declarator: identifier @name          ← int foo(int a)
#     body: compound_statement
#
#   function_definition
#     type: ...
#     declarator: pointer_declarator
#       declarator: function_declarator
#         declarator: identifier @name        ← int *foo(int a)
#     body: compound_statement
#
# We write two separate query patterns and merge their results.
# Both produce capture_name="function" and capture_name="name".
#
# NOTE: function pointers (stored as variable declarations, not
# function_definition nodes) are intentionally NOT captured as functions —
# they are data, not executable units in the same structural sense.

_C_FUNCTION_QUERY = """
(function_definition
  declarator: (function_declarator
    declarator: (identifier) @name)) @function

(function_definition
  declarator: (pointer_declarator
    declarator: (function_declarator
      declarator: (identifier) @name))) @function
"""

# C struct/union captures.
#
# Named struct with body:
#   struct_specifier
#     name: type_identifier @name
#     body: field_declaration_list
#
# Named union with body:
#   union_specifier
#     name: type_identifier @name
#     body: field_declaration_list
#
# typedef struct (named via typedef):
#   type_definition
#     type: struct_specifier
#       body: field_declaration_list
#     declarator: type_identifier @name   ← typedef name
#
# The typedef pattern captures the typedef alias name (@name) and the
# type_definition root (@class) rather than the inner struct_specifier,
# so the granule spans the full typedef including the alias.

_C_CLASS_QUERY = """
(struct_specifier
  name: (type_identifier) @name
  body: (field_declaration_list)) @class

(union_specifier
  name: (type_identifier) @name
  body: (field_declaration_list)) @class

(type_definition
  type: (struct_specifier
    body: (field_declaration_list))
  declarator: (type_identifier) @name) @class

(type_definition
  type: (union_specifier
    body: (field_declaration_list))
  declarator: (type_identifier) @name) @class
"""

_C_LOOP_QUERY = """
[
  (for_statement)
  (while_statement)
  (do_statement)
] @loop
"""

# Single compound query — all patterns evaluated in one DFS pass.
_C_ALL_QUERY = _C_FUNCTION_QUERY + "\n" + _C_CLASS_QUERY + "\n" + _C_LOOP_QUERY


# ---------------------------------------------------------------------------
# Parser implementation
# ---------------------------------------------------------------------------


class CParser:
    """
    Tree-sitter–backed parser for C source files (.c and .h).

    Satisfies the LanguageParser Protocol (cipas.parsing.base).
    Does NOT inherit — structural conformance only.

    C-specific considerations:
      - Header files (.h) are parsed with the same C grammar. They typically
        contain struct declarations, function prototypes, and macros.
        Macros (#define) are NOT captured as granules — they are preprocessor
        directives and tree-sitter's C grammar represents them as
        `preproc_def` / `preproc_function_def` nodes which are deliberately
        excluded from our queries.
      - Function prototypes (declarations without a body) are NOT captured
        because they lack a `body: compound_statement` child.  This is
        intentional — we want executable units, not declarations.
      - K&R-style function definitions (pre-ANSI C, parameter types declared
        after the parameter list) use a different `declarator` structure.
        They are not captured by the current queries. Phase 2 can add a
        query pattern for `old_style_function_definition` if needed.
      - `static inline` functions defined in headers ARE captured because
        they have a compound_statement body.
    """

    language_key: ClassVar[str] = "c"

    def __init__(self) -> None:
        try:
            from tree_sitter_languages import (  # type: ignore[import]
                get_language,
                get_parser,
            )
        except ImportError as exc:
            raise ImportError(
                "tree-sitter and tree-sitter-languages must be installed. "
                "Run: poetry install"
            ) from exc

        self._language: Any = get_language(self.language_key)
        self._parser: Any = get_parser(self.language_key)
        # Compile the compound query once per process.
        self._query: Any = self._language.query(_C_ALL_QUERY)

    # ------------------------------------------------------------------
    # LanguageParser.parse()
    # ------------------------------------------------------------------

    def parse(self, source: bytes) -> Any:
        """
        Parse UTF-8 encoded C source bytes.

        C source files (especially headers) may contain preprocessor macros
        that tree-sitter does not expand.  The tree-sitter C grammar models
        preprocessor directives as opaque `preproc_*` nodes — they are
        present in the CST but do not affect our structural queries.

        Args:
            source: Raw UTF-8 bytes of the C source or header file.

        Returns:
            tree_sitter.Tree

        Raises:
            cipas.core.exceptions.ParseError: If tree-sitter returns None
                (catastrophic internal failure — should never occur with
                tree-sitter-languages).
        """
        tree: Any = self._parser.parse(source)
        if tree is None:
            from cipas.core.exceptions import ParseError

            raise ParseError(
                filename="<unknown>",
                language=self.language_key,
                reason="tree-sitter C parser returned None (internal error)",
            )
        return tree

    # ------------------------------------------------------------------
    # LanguageParser.extract_raw_granules()
    # ------------------------------------------------------------------

    def extract_raw_granules(
        self,
        tree: Any,
        source: bytes,
        *,
        max_nodes: int = 10_000,
    ) -> list[RawGranule]:
        """
        Execute TSQueries against the parsed C tree and return RawGranules.

        Behaviour with preprocessor directives:
          Macro definitions and #include directives appear as `preproc_*`
          nodes in the tree.  Our queries do not match these node types,
          so they are transparently ignored.

        Behaviour with header files (.h):
          Header files may contain only struct declarations and function
          prototypes (no bodies).  In this case:
            - struct_specifier nodes WITH body → @class granules extracted.
            - function_definition nodes are absent → no @function granules.
            - The file may produce zero granules (e.g. a header with only
              macro guards and #include statements).

        Nested struct handling:
          A struct containing an anonymous inner struct produces two @class
          granules: the outer and the inner.  Named inner structs produce
          separate @class granules with their own @name.

        Args:
            tree:       tree_sitter.Tree from parse().
            source:     Same bytes buffer passed to parse().
            max_nodes:  AST node ceiling per granule (see base.LanguageParser).

        Returns:
            List[RawGranule] ordered by start byte position.
            May be empty for header files with only preprocessor content.
        """
        root_node: Any = tree.root_node

        # translation_unit is the root node type for C files in tree-sitter.
        # If it is an ERROR node with no children, no granules are extractable.
        if root_node.type == "ERROR" and len(root_node.children) == 0:
            return []

        captures: list[tuple[Any, str]] = self._query.captures(root_node)
        return _build_granules(
            captures=captures,
            source=source,
            max_nodes=max_nodes,
        )


# ---------------------------------------------------------------------------
# C-specific DFS helper (re-exported for test access)
# ---------------------------------------------------------------------------
# C uses the same named-nodes-only DFS algorithm as Python and Java.
# Re-exported here so tests can import directly from the C module.

dfs_node_types = _dfs_node_types


__all__ = ["CParser", "dfs_node_types"]
