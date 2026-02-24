# gradeloop-core-v2/apps/services/cipas-service/src/cipas/parsing/base.py
"""
Language-agnostic parser abstraction layer.

This module defines the structural Protocol that all language-specific parsers
must satisfy, plus the data-transfer types they produce.

Design decisions:
  - `LanguageParser` is a `Protocol` (PEP 544 structural subtyping), NOT an
    abstract base class. Concrete parsers satisfy it implicitly — no inheritance
    required. This decouples the abstraction from the implementation and allows
    third-party or alternative parsers to be swapped in without modification.

  - `@runtime_checkable` allows `isinstance(obj, LanguageParser)` checks in
    the registry's validation logic, without forcing inheritance.

  - `RawGranule` and `GranuleSpan` are plain dataclasses (frozen where possible)
    because they are created inside subprocess workers. They must be lightweight
    and picklable. Pydantic models are NOT used here — Pydantic's import overhead
    (~50ms) inside a fresh subprocess is unacceptable when the worker initialiser
    runs for every pool process.

  - The parser interface accepts and returns `bytes` / tree-sitter `Tree` objects
    (typed as `object` to avoid importing tree-sitter at the protocol level —
    tree-sitter is a C extension and its types are not importable without loading
    the shared library). Concrete implementations cast to the real types.

  - This module has ZERO non-stdlib imports. It must be importable in any context:
    event loop, subprocess worker, test harness, or CLI — with no side effects.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from typing import ClassVar, Protocol, runtime_checkable

# ---------------------------------------------------------------------------
# Data-transfer types produced by parsers
# ---------------------------------------------------------------------------


@dataclass(frozen=True)
class GranuleSpan:
    """
    Source-location span for a single extracted granule.

    Line numbers are 0-indexed (tree-sitter native representation).
    The conversion to 1-indexed storage format is applied by the
    GranuleExtractor — never by the parser itself.

    Byte offsets are relative to the start of the file, as reported by
    tree-sitter. They are used to slice the source bytes buffer without
    re-scanning the file character-by-character.

    Invariants (enforced by GranuleExtractor, not here):
      start_line <= end_line
      start_byte <  end_byte
    """

    start_line: int  # 0-indexed
    end_line: int  # 0-indexed, inclusive
    start_byte: int  # byte offset from start of file
    end_byte: int  # byte offset from start of file, exclusive


@dataclass
class RawGranule:
    """
    A structural unit extracted from a source file by a LanguageParser.

    "Raw" means no normalisation, hashing, or UUID assignment has been
    applied yet. Those operations are the responsibility of GranuleExtractor
    and the pipeline layer respectively.

    Fields:
      granule_type:
        Coarse structural category: "class" | "function" | "loop".
        String (not GranuleType enum) to avoid importing domain models here.

      name:
        The identifier captured by the TSQuery's @name capture group.
        None for anonymous constructs (e.g. a while loop with no label).

      span:
        Source location of the granule's root node in the file.

      source_bytes:
        The raw bytes slice from the file corresponding to this granule's
        span: source_bytes[span.start_byte:span.end_byte].
        This is a slice (bytes object), not a memoryview.  Immutable.

      node_type_sequence:
        DFS pre-order traversal of the AST node types within this granule.
        Contains only node.type strings — no identifiers, no literal values.
        Used to compute the ast_fingerprint (structural identity hash).

        Example for a simple Python function `def add(a, b): return a + b`:
          ["function_definition", "def", "identifier", "parameters",
           "(", "identifier", ",", "identifier", ")", ":", "block",
           "return_statement", "return", "binary_operator", "identifier",
           "+", "identifier"]

        The sequence must be deterministic (DFS, same order as tree-sitter
        child iteration) so that structurally identical code always produces
        the same sequence regardless of identifier names.

      is_oversized:
        Set to True by the parser if len(node_type_sequence) exceeds
        MAX_GRANULE_AST_NODES. Oversized granules are stored with a
        special marker in the DB (normalized_source=NULL) and excluded
        from hash-based clone detection, but their existence is recorded
        for observability.
    """

    granule_type: str  # "class" | "function" | "loop"
    name: str | None  # identifier or None
    span: GranuleSpan
    source_bytes: bytes  # slice of the original file bytes
    node_type_sequence: list[str] = field(default_factory=list)
    is_oversized: bool = False

    def __repr__(self) -> str:
        name_part = f" name={self.name!r}" if self.name else ""
        return (
            f"RawGranule("
            f"type={self.granule_type!r}{name_part} "
            f"lines={self.span.start_line + 1}-{self.span.end_line + 1} "
            f"nodes={len(self.node_type_sequence)}"
            f"{'  OVERSIZED' if self.is_oversized else ''}"
            f")"
        )


# ---------------------------------------------------------------------------
# Parser Protocol
# ---------------------------------------------------------------------------


@runtime_checkable
class LanguageParser(Protocol):
    """
    Structural interface for all language-specific parsers.

    Implementing a LanguageParser:
    ─────────────────────────────
    Create a class with:
      1. A `language_key` ClassVar[str] matching the key used in
         `tree_sitter_languages.get_language(language_key)` and the
         Language enum value (e.g. "python", "java", "c").
      2. A `parse(source: bytes) -> object` method that calls the
         tree-sitter parser and returns a Tree.
      3. An `extract_raw_granules(tree, source) -> list[RawGranule]`
         method that executes the language-specific TSQueries and
         constructs RawGranule instances.

    The class does NOT need to inherit from LanguageParser.

    Contract:
    ─────────
      - Instances MUST be safe to create multiple times (one per subprocess).
      - Instances MUST be stateless after __init__. The Parser and Language
        objects created in __init__ are immutable C-level objects.
      - parse() and extract_raw_granules() MUST NOT perform any I/O.
      - parse() MUST accept bytes (UTF-8 encoded). Never str.
      - extract_raw_granules() MUST NOT raise on syntax errors in the source;
        it should return whatever granules it can extract from the partial tree.
        If the tree is a complete error, it should return an empty list.
      - node_type_sequence in returned RawGranules MUST be produced by DFS
        pre-order traversal, respecting tree-sitter's child ordering.

    Adding a new language:
    ──────────────────────
    1. Ensure the language is supported by tree-sitter-languages:
           from tree_sitter_languages import get_language
           lang = get_language("kotlin")  # raises if not supported
    2. Create `cipas/parsing/kotlin_parser.py` with a `KotlinParser` class.
    3. Add `Language.KOTLIN = "kotlin"` to domain/models.py.
    4. Register in `cipas/parsing/registry.py`:
           _REGISTRY["kotlin"] = KotlinParser
    5. Add file extension mapping to `Language.from_extension()`.
    No other files need to change.
    """

    # Class-level language key. Used by the registry to map Language enum
    # values to parser classes. Must match get_language() argument.
    language_key: ClassVar[str]

    def parse(self, source: bytes) -> object:
        """
        Parse UTF-8 encoded source bytes and return a tree-sitter Tree.

        The returned object is a `tree_sitter.Tree`. Typed as `object`
        here to avoid importing tree-sitter at the protocol module level.

        Raises:
            ParseError (cipas.core.exceptions): If tree-sitter returns a
                null tree (indicates a catastrophic internal error, not merely
                a syntax error — tree-sitter always returns a partial tree for
                syntax errors). In practice this should never occur with
                tree-sitter-languages.
        """
        ...

    def extract_raw_granules(
        self,
        tree: object,
        source: bytes,
        *,
        max_nodes: int = 10_000,
    ) -> list[RawGranule]:
        """
        Execute language-specific TSQueries against `tree` and extract granules.

        Parameters:
            tree:       A `tree_sitter.Tree` returned by `parse()`.
            source:     The same bytes buffer that was passed to `parse()`.
                        Required for slicing node source ranges.
            max_nodes:  Maximum AST node count per granule before the granule
                        is flagged as `is_oversized=True`. Defaults to 10,000.
                        Callers should pass `settings.MAX_GRANULE_AST_NODES`.

        Returns:
            A list of RawGranule instances, one per matched node.
            Nested granules (e.g. a method inside a class) are each returned
            independently — the class granule and the method granule are both
            in the list. Nesting relationships can be derived from span overlap.
            Returns an empty list if no granules are found or the tree is an
            error tree.

        Does NOT raise for syntax errors in the source. tree-sitter always
        returns a partial tree; TSQueries operate on whatever nodes exist.
        """
        ...


# ---------------------------------------------------------------------------
# Public exports
# ---------------------------------------------------------------------------

__all__ = [
    "GranuleSpan",
    "RawGranule",
    "LanguageParser",
]
