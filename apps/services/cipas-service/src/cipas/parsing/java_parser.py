# gradeloop-core-v2/apps/services/cipas-service/src/cipas/parsing/java_parser.py
"""
Java language parser backed by tree-sitter-languages.

Responsibilities:
  - Hold a single tree-sitter Parser (configured for Java) and Language
    object, created once in __init__ and reused across all parse calls.
  - Define TSQuery strings for CLASS, FUNCTION (methods + constructors),
    and LOOP granules specific to the Java grammar.
  - Execute those queries against a parsed Tree and return RawGranule instances.

Java grammar notes (tree-sitter-languages grammar version ~0.20):
  - Methods are represented as `method_declaration` nodes.
  - Constructors are `constructor_declaration` nodes (distinct from methods
    in the grammar — they have no return type).  Both are captured as
    granule_type="function" because they represent executable units.
  - Classes and interfaces are distinct node types but both represent
    structural units suitable for Type 1–3 clone detection.
  - Java has four loop constructs:
      for_statement           — traditional for(;;)
      enhanced_for_statement  — for(T x : collection)
      while_statement
      do_statement            — do { } while()
    All four are captured as granule_type="loop".

TSQuery capture convention (same as python_parser.py):
  @function / @class / @loop  — structural root capture
  @name                       — identifier capture (child of structural node)

tree-sitter 0.20.x captures() returns List[Tuple[Node, str]].
Grouping logic is shared with python_parser._build_granules() via the
imported helper.  Java-specific query strings are defined here; the
common traversal and RawGranule construction is reused from the base helper.
"""

from __future__ import annotations

from typing import Any, ClassVar

from cipas.parsing.base import GranuleSpan, LanguageParser, RawGranule
from cipas.parsing.python_parser import _build_granules, _dfs_node_types

# ---------------------------------------------------------------------------
# TSQuery definitions
# ---------------------------------------------------------------------------
# tree-sitter Java grammar field names:
#   method_declaration:
#     type_parameters, type (return type), name (identifier), parameters,
#     throws, body
#   constructor_declaration:
#     modifiers, type_parameters, name (identifier), parameters, throws, body
#   class_declaration:
#     modifiers, name (identifier), type_parameters, superclass, interfaces, body
#   interface_declaration:
#     modifiers, name (identifier), type_parameters, extends_interfaces, body
#
# We capture `name: (identifier)` in each case.
# For loops, there is no @name capture — loops are anonymous structural units.

_JAVA_FUNCTION_QUERY = """
(method_declaration
  name: (identifier) @name) @function

(constructor_declaration
  name: (identifier) @name) @function
"""

_JAVA_CLASS_QUERY = """
(class_declaration
  name: (identifier) @name) @class

(interface_declaration
  name: (identifier) @name) @class

(enum_declaration
  name: (identifier) @name) @class

(record_declaration
  name: (identifier) @name) @class
"""

_JAVA_LOOP_QUERY = """
[
  (for_statement)
  (enhanced_for_statement)
  (while_statement)
  (do_statement)
] @loop
"""

# Single compound query executed in one DFS pass over the file tree.
_JAVA_ALL_QUERY = (
    _JAVA_FUNCTION_QUERY + "\n" + _JAVA_CLASS_QUERY + "\n" + _JAVA_LOOP_QUERY
)


# ---------------------------------------------------------------------------
# Parser implementation
# ---------------------------------------------------------------------------


class JavaParser:
    """
    Tree-sitter–backed parser for Java source files.

    Satisfies the LanguageParser Protocol (cipas.parsing.base).
    Does NOT inherit — structural conformance only.

    Java-specific considerations:
      - Java files can be large (enterprise codebases routinely have 3000+ LOC
        files).  The 1 MB file size limit keeps worst-case parse time to ~150ms.
      - Nested classes are fully supported: each class_declaration node (inner
        or outer) is captured independently as a @class granule.
      - Anonymous classes (new Runnable() { ... }) are NOT captured because
        they lack a `name: (identifier)` child — the query requires @name.
        This is intentional for Phase 1.  Phase 2 can add a separate query
        for anonymous class bodies.
      - Lambda expressions are NOT captured as granules in Phase 1.
      - Generic type parameter syntax does not affect the captured identifier
        (e.g., `class Pair<K, V>` captures "Pair" as the @name, not "Pair<K,V>").
    """

    language_key: ClassVar[str] = "java"

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
        self._query: Any = self._language.query(_JAVA_ALL_QUERY)

    # ------------------------------------------------------------------
    # LanguageParser.parse()
    # ------------------------------------------------------------------

    def parse(self, source: bytes) -> Any:
        """
        Parse UTF-8 encoded Java source bytes.

        tree-sitter always returns a partial tree even for files with syntax
        errors (e.g. missing semicolons, mismatched braces).  The tree may
        contain ERROR nodes; extract_raw_granules tolerates this by querying
        whatever valid nodes exist.

        Args:
            source: Raw UTF-8 bytes of the Java source file.

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
                reason="tree-sitter Java parser returned None (internal error)",
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
        Execute TSQueries against the parsed Java tree and return RawGranules.

        Behaviour on partial / error trees:
          If the file has severe syntax errors, the root may be or contain
          ERROR nodes.  tree-sitter TSQuery still matches whatever valid
          subtrees exist, so we return whatever granules are extractable.
          A file consisting entirely of a single ERROR root node returns [].

        Nested class handling:
          A Java file with an outer class containing inner classes produces:
            - 1 @class granule for the outer class (full file span)
            - 1 @class granule for each inner class (their span only)
            - @function granules for each method, in both inner and outer
          All are returned; nesting can be derived from span containment.

        Args:
            tree:       tree_sitter.Tree from parse().
            source:     Same bytes buffer passed to parse().
            max_nodes:  AST node ceiling per granule (see base.LanguageParser).

        Returns:
            List[RawGranule] ordered by start byte position.
        """
        root_node: Any = tree.root_node

        # If the root is a bare ERROR with no children, no granules exist.
        if root_node.type == "ERROR" and len(root_node.children) == 0:
            return []

        captures: list[tuple[Any, str]] = self._query.captures(root_node)
        return _build_granules(
            captures=captures,
            source=source,
            max_nodes=max_nodes,
        )


# ---------------------------------------------------------------------------
# Java-specific DFS helper (re-exported for test access)
# ---------------------------------------------------------------------------
# Java uses the same _dfs_node_types logic as Python (named-nodes-only DFS).
# The function is imported from python_parser rather than duplicated because
# the algorithm is language-agnostic — only the tree structure differs.
# Re-exported here so tests can import it from the Java module directly.

dfs_node_types = _dfs_node_types


__all__ = ["JavaParser", "dfs_node_types"]
