# gradeloop-core-v2/apps/services/cipas-service/src/cipas/parsing/python_parser.py
"""
Python language parser backed by tree-sitter-languages.

Responsibilities:
  - Hold a single tree-sitter Parser (configured for Python) and Language
    object, created once in __init__ and reused across all parse calls.
  - Define TSQuery strings for extracting CLASS, FUNCTION, and LOOP granules.
  - Execute those queries against a parsed Tree and return RawGranule instances.

TSQuery capture convention:
  Every query uses exactly two capture groups per granule type:
    @<type>   — captures the root node of the structural unit (e.g. @function)
    @name     — captures the identifier node (may be absent for anonymous loops)

  When the same node appears in multiple captures (e.g. a method inside a
  class matches both @function and is nested inside @class), BOTH granules are
  returned.  Nesting relationships are determined by span overlap at query time.

tree-sitter 0.20.x captures() API:
  language.query(s).captures(root_node)
  → List[Tuple[Node, str]]   where str is the capture name
  The list is ordered by node start byte, then by capture name alphabetically.
  Multiple capture names can match the same node — we group by the structural
  capture name (@function, @class, @loop) not @name.

Memory safety:
  - All Node objects are C-level wrappers owned by the Tree.
  - We extract source_bytes slices immediately (bytes(source[start:end])) and
    store them in RawGranule.  After extract_raw_granules() returns, the caller
    may let the Tree go out of scope and it will be freed by the GC.
  - node_type_sequence is built by DFS traversal; we use an iterative stack
    to avoid Python recursion limits on deeply nested trees (e.g. long chains
    of binary operators).
"""

from __future__ import annotations

from typing import Any, ClassVar

from cipas.parsing.base import GranuleSpan, LanguageParser, RawGranule

# ---------------------------------------------------------------------------
# TSQuery definitions
# ---------------------------------------------------------------------------
# Queries are defined as module-level constants so they are compiled once per
# module load (once per subprocess worker process) rather than once per call.
#
# tree-sitter 0.20.x query syntax:
#   (node_type field: (child_type) @capture_name) @root_capture
#
# Named captures (@function, @class, @loop) identify the root node of each
# granule.  The @name capture identifies the identifier if present.
#
# IMPORTANT: queries are applied to the FULL file tree, not per-node.
# tree-sitter returns all matches across the entire file in a single call.

_PYTHON_FUNCTION_QUERY = """
(function_definition
  name: (identifier) @name) @function
"""

_PYTHON_CLASS_QUERY = """
(class_definition
  name: (identifier) @name) @class
"""

_PYTHON_LOOP_QUERY = """
[
  (for_statement) @loop
  (while_statement) @loop
]
"""

# Compound query: all three types in a single pass for efficiency.
# tree-sitter evaluates all patterns in a single DFS walk of the tree,
# so one query call is faster than three separate calls.
_PYTHON_ALL_QUERY = (
    _PYTHON_FUNCTION_QUERY + "\n" + _PYTHON_CLASS_QUERY + "\n" + _PYTHON_LOOP_QUERY
)


# ---------------------------------------------------------------------------
# Parser implementation
# ---------------------------------------------------------------------------


class PythonParser:
    """
    Tree-sitter–backed parser for Python source files.

    Satisfies the LanguageParser Protocol (cipas.parsing.base).
    Does NOT inherit from it — structural conformance is checked by the
    registry via isinstance(parser, LanguageParser).

    Lifecycle:
      - __init__:  Loads the Python language grammar (O(μs) — grammar .so is
                   already mmap'd by the OS after first load).
                   Compiles the TSQuery (O(μs) — pattern → bytecode).
                   Creates one Parser instance.
      - parse():   Calls parser.parse(source_bytes) → Tree.  ~5–15ms per file.
      - extract_raw_granules(): Executes the compiled query, iterates captures,
                   builds RawGranule list.  ~1–5ms per file.
    """

    language_key: ClassVar[str] = "python"

    def __init__(self) -> None:
        # Defer tree-sitter imports to __init__ so this module is importable
        # in environments where tree-sitter is not installed (e.g. type-checking
        # environments, unit tests with mocked parsers).
        try:
            from tree_sitter import Parser  # type: ignore[import]
            from tree_sitter_languages import (  # type: ignore[import]
                get_language,
                get_parser,
            )
        except ImportError as exc:
            raise ImportError(
                "tree-sitter and tree-sitter-languages must be installed. "
                "Run: poetry install"
            ) from exc

        # `get_language` returns a tree_sitter.Language capsule bound to the
        # Python grammar compiled in tree-sitter-languages.
        self._language: Any = get_language(self.language_key)

        # `get_parser` returns a pre-configured Parser with the language set.
        # We use this instead of constructing Parser() + set_language() to
        # ensure we always get a correctly configured instance.
        self._parser: Any = get_parser(self.language_key)

        # Compile the compound query once.  Subsequent .captures() calls reuse
        # the compiled bytecode without re-parsing the query string.
        self._query: Any = self._language.query(_PYTHON_ALL_QUERY)

    # ------------------------------------------------------------------
    # LanguageParser.parse()
    # ------------------------------------------------------------------

    def parse(self, source: bytes) -> Any:
        """
        Parse UTF-8 encoded Python source bytes.

        Returns a tree_sitter.Tree.  Never returns None — tree-sitter always
        produces a partial tree even for completely invalid syntax.  The tree
        may contain ERROR nodes; extract_raw_granules handles this gracefully
        by querying whatever nodes are present.

        Args:
            source: Raw UTF-8 bytes of the Python source file.

        Returns:
            tree_sitter.Tree

        Raises:
            cipas.core.exceptions.ParseError: If tree-sitter returns None
                (catastrophic internal failure — should never happen in practice).
        """
        tree: Any = self._parser.parse(source)
        if tree is None:
            from cipas.core.exceptions import ParseError

            raise ParseError(
                filename="<unknown>",
                language=self.language_key,
                reason="tree-sitter parser returned None (internal error)",
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
        Execute TSQueries against the parsed tree and build RawGranule list.

        Capture grouping strategy:
          The query returns a flat list of (node, capture_name) pairs.
          We group by the structural capture names ("function", "class", "loop")
          and pair each with its @name capture where present.

          For each structural node we:
            1. Extract the source slice (node.start_byte → node.end_byte).
            2. Build the DFS node-type sequence (iterative, stack-based).
            3. Flag as oversized if len(sequence) > max_nodes.
            4. Construct a RawGranule.

        Overlap handling:
          tree-sitter TSQuery returns ALL matching nodes, including nested ones.
          A method inside a class produces two granules: one @class and one
          @function.  This is intentional — clone detection operates at each
          granule level independently.

        Returns:
            List of RawGranule, ordered by start byte position.
            Empty list if the tree has only ERROR nodes or no matches.
        """
        root_node: Any = tree.root_node

        # Short-circuit on completely failed parses (root is an ERROR node
        # with no children) — no granules to extract.
        if root_node.type == "ERROR" and len(root_node.children) == 0:
            return []

        # Execute the compiled query.
        # Returns: List[Tuple[Node, str]]
        # e.g. [(func_node, "function"), (name_node, "name"), ...]
        captures: list[tuple[Any, str]] = self._query.captures(root_node)

        return _build_granules(
            captures=captures,
            source=source,
            max_nodes=max_nodes,
        )


# ---------------------------------------------------------------------------
# Internal helpers  (module-level so they are importable/testable directly)
# ---------------------------------------------------------------------------


def _build_granules(
    captures: list[tuple[Any, str]],
    source: bytes,
    max_nodes: int,
) -> list[RawGranule]:
    """
    Convert a flat list of (Node, capture_name) pairs into RawGranule objects.

    Algorithm:
      1. Build a mapping:  node_id → name_str  from @name captures.
      2. Iterate structural captures (@function, @class, @loop).
         For each, look up the @name mapping using node start_byte as the
         scope key (the @name node is always a child of the structural node).
      3. Extract source slice, build DFS sequence, construct RawGranule.

    The @name lookup uses the structural node's identity (id(node) or
    start_byte + end_byte as a proxy key) because tree-sitter Node objects
    are ephemeral wrappers that may not support == by identity.

    tree-sitter 0.20.x guarantees that captures are ordered by start_byte,
    so the @name capture for a function always appears after its @function
    capture (or interleaved with it). We collect all captures first, then
    process in a second pass to avoid ordering assumptions.
    """
    # Map: (start_byte, end_byte) → capture_name for structural nodes.
    # A structural node is one whose capture name is NOT "name".
    # This tuple key uniquely identifies a node within a file.
    structural_captures: list[tuple[Any, str]] = []
    # Map: parent structural node span → identifier string from @name capture.
    # We use the parent's span as key because the @name node's position is
    # always within the parent's span.
    name_map: dict[tuple[int, int], str] = {}

    for node, capture_name in captures:
        if capture_name == "name":
            # This is an identifier node.  Find its enclosing structural node
            # by checking which structural node's span contains this node.
            # Deferred: collected first, resolved after structural pass.
            name_map[(node.start_byte, node.end_byte)] = source[
                node.start_byte : node.end_byte
            ].decode("utf-8", errors="replace")
        else:
            structural_captures.append((node, capture_name))

    # Now resolve @name for each structural node.
    # For each structural node, its identifier is the @name node that is
    # (a) a descendant of it and (b) appears immediately in the query pattern.
    # In tree-sitter 0.20, the query captures them in tree order, so the
    # @name node always appears immediately after its parent structural node
    # in the captures list.  We build a resolved name map keyed by the
    # structural node's span.
    resolved_names: dict[tuple[int, int], str] = {}
    for (name_start, name_end), name_str in name_map.items():
        # Find the smallest structural node whose span contains [name_start, name_end].
        best_key: tuple[int, int] | None = None
        best_span = (0, len(source) + 1)
        for s_node, _ in structural_captures:
            if s_node.start_byte <= name_start and s_node.end_byte >= name_end:
                span_size = s_node.end_byte - s_node.start_byte
                best_size = best_span[1] - best_span[0]
                if span_size < best_size:
                    best_key = (s_node.start_byte, s_node.end_byte)
                    best_span = (s_node.start_byte, s_node.end_byte)
        if best_key is not None:
            resolved_names[best_key] = name_str

    # Build RawGranule for each structural capture.
    granules: list[RawGranule] = []
    seen_spans: set[tuple[int, int, str]] = set()  # (start, end, type) deduplication

    for node, capture_name in structural_captures:
        span_key = (node.start_byte, node.end_byte, capture_name)
        if span_key in seen_spans:
            # The same node matched by multiple query patterns → deduplicate.
            continue
        seen_spans.add(span_key)

        # Map capture name to GranuleType string.
        granule_type = _CAPTURE_TO_GRANULE_TYPE.get(capture_name)
        if granule_type is None:
            continue

        # Extract source bytes slice.
        source_slice: bytes = bytes(source[node.start_byte : node.end_byte])

        # Build DFS node-type sequence iteratively (avoids recursion limit).
        node_types: list[str] = _dfs_node_types(node)
        is_oversized = len(node_types) > max_nodes
        if is_oversized:
            # Truncate to max_nodes to prevent GranuleExtractor OOM in
            # the normaliser / hasher.  The is_oversized flag signals the
            # extractor to mark this granule accordingly.
            node_types = node_types[:max_nodes]

        # Resolve name from the pre-built map.
        node_key = (node.start_byte, node.end_byte)
        name: str | None = resolved_names.get(node_key)

        granule = RawGranule(
            granule_type=granule_type,
            name=name,
            span=GranuleSpan(
                start_line=node.start_point[0],  # 0-indexed row
                end_line=node.end_point[0],  # 0-indexed row
                start_byte=node.start_byte,
                end_byte=node.end_byte,
            ),
            source_bytes=source_slice,
            node_type_sequence=node_types,
            is_oversized=is_oversized,
        )
        granules.append(granule)

    # Sort by start byte for deterministic ordering.
    granules.sort(key=lambda g: g.span.start_byte)
    return granules


def _dfs_node_types(root: Any) -> list[str]:
    """
    Iterative DFS pre-order traversal collecting node.type strings.

    Uses an explicit stack to avoid Python recursion limit issues on
    deeply nested trees (e.g., a chain of 1000+ binary operators or
    a switch statement with 5000 cases).

    Only NAMED nodes are included — anonymous nodes (punctuation, keywords
    represented as literals) are excluded to reduce sequence length while
    retaining structural semantics.  In tree-sitter, node.is_named == False
    for literal nodes like "(" or "if".

    Including unnamed nodes would make the fingerprint fragile across
    minor grammar version updates that change how punctuation is tokenised.
    """
    types: list[str] = []
    stack: list[Any] = [root]
    while stack:
        node: Any = stack.pop()
        if node.is_named:
            types.append(node.type)
        # Push children in reverse order so leftmost child is processed first.
        for child in reversed(node.children):
            stack.append(child)
    return types


# Maps tree-sitter capture names to GranuleType string values.
_CAPTURE_TO_GRANULE_TYPE: dict[str, str] = {
    "function": "function",
    "class": "class",
    "loop": "loop",
}


__all__ = ["PythonParser"]
