"""
Multi-Granularity Segmentation — Phase 1 Pre-processing.

Segments a source file into a collection of ``Fragment`` objects using a
hybrid of structural block extraction and sliding-window fallback:

  1. Structural Blocks — extract ``function_definition``, ``class_declaration``
     and control blocks (``if``, ``for``, ``while``, ``switch``, …) via
     Tree-sitter CST traversal.

  2. Sliding Window  — for any block (or for a whole file) that is longer
     than 50 tokens, emit 40-token windows with a 10-token stride.

  3. Template Filtering — ``TemplateFilter`` discards any fragment whose
     normalised token Jaccard similarity against a stored instructor skeleton
     is ≥ ``TEMPLATE_JACCARD_THRESHOLD`` (default 0.9).

Key design decisions
--------------------
* The tokenizer wraps the existing ``TreeSitterTokenizer`` so language
  support (Java, Python, C, C#) is inherited automatically.
* ``abstract_tokens`` use the ``UniversalTokenMapper`` so fragments from
  different languages share the same vocabulary before MinHash.
* C# is handled via a regex-based fallback when ``tree-sitter-c-sharp`` is
  not installed (optional dependency).

Usage
-----
    from clone_detection.preprocessor import Fragmenter, TemplateFilter
    from clone_detection.preprocessor import Fragment

    fragmenter = Fragmenter("java")
    fragments = fragmenter.segment(source_code, submission_id="sub_001",
                                   student_id="stu_42", assignment_id="hw3")

    tpl_filter = TemplateFilter()
    tpl_filter.register_template("hw3", instructor_source, "java")
    clean = tpl_filter.filter(fragments)
"""

from __future__ import annotations

import re
from dataclasses import dataclass
from typing import Optional, Sequence

from .normalizers.universal_mapper import UniversalTokenMapper
from .tokenizers.tree_sitter_tokenizer import TreeSitterTokenizer
from .utils.common_setup import setup_logging

logger = setup_logging(__name__)

# ────────────────────────────────────────────────────────────────────────────
# Constants
# ────────────────────────────────────────────────────────────────────────────

SLIDING_WINDOW_MIN_TOKENS: int = 50   # emit windows for blocks longer than this
WINDOW_SIZE: int = 40
WINDOW_STRIDE: int = 10
TEMPLATE_JACCARD_THRESHOLD: float = 0.90  # discard if ≥ this similarity vs template

# CST node types treated as "top-level structural blocks"
_STRUCTURAL_BLOCK_TYPES: frozenset[str] = frozenset([
    # Functions / methods
    "function_definition",        # Python, C
    "method_declaration",         # Java
    "constructor_declaration",    # Java
    "local_function_statement",   # C#
    "arrow_function",
    "lambda_expression",
    # Classes
    "class_declaration",          # Java, Python, C#
    "class_definition",           # Python
    "interface_declaration",
    "enum_declaration",
    "struct_specifier",           # C
    "record_declaration",
    # Control blocks (standalone)
    "if_statement",
    "for_statement",
    "enhanced_for_statement",
    "foreach_statement",
    "while_statement",
    "do_statement",
    "switch_statement",
    "switch_expression",
    "try_statement",
    "with_statement",
    "match_statement",
])


# ────────────────────────────────────────────────────────────────────────────
# Data model
# ────────────────────────────────────────────────────────────────────────────

@dataclass
class Fragment:
    """A single code fragment extracted from a submission."""
    submission_id: str
    student_id: str
    assignment_id: str
    language: str
    raw_source: str            # Original source text of this fragment
    abstract_tokens: list[str] # Universal-mapped token stream (for MinHash)
    token_count: int
    byte_offset: int           # Byte offset in the original file
    fragment_type: str         # "structural" | "window" | "whole_file"
    node_type: Optional[str] = None  # CST node type if structural
    is_template: bool = False
    # Populated after LSH indexing:
    fragment_id: Optional[str] = None
    lsh_signature: Optional[bytes] = None


# ────────────────────────────────────────────────────────────────────────────
# Fragmenter
# ────────────────────────────────────────────────────────────────────────────

class Fragmenter:
    """
    Hybrid fragmenter: structural extraction + sliding-window fallback.

    Supports Java, Python, C and C# (C# via regex fallback when the optional
    ``tree-sitter-c-sharp`` package is unavailable).
    """

    def __init__(self, language: str = "java") -> None:
        self.language = language.lower().replace(" ", "").replace("#", "sharp")
        self._tokenizer = TreeSitterTokenizer()
        self._mapper = UniversalTokenMapper(language)
        self._has_ts = language.replace("c#", "csharp") in ("java", "python", "c")

    # ── Public ──────────────────────────────────────────────────────────────

    def segment(
        self,
        source: str,
        submission_id: str,
        student_id: str,
        assignment_id: str,
    ) -> list[Fragment]:
        """
        Segment ``source`` into fragments.

        Returns a (possibly empty) list of Fragment objects.  Duplicates
        (identical abstract_token lists) are deduplicated.
        """
        fragments: list[Fragment] = []

        # ── 1. Structural blocks via Tree-sitter ─────────────────────────
        ts_lang = self.language if self.language != "csharp" else None
        if ts_lang in ("java", "python", "c"):
            try:
                blocks = self._extract_structural_blocks(source, ts_lang)
                for raw_block, node_type, offset in blocks:
                    frag = self._make_fragment(
                        raw=raw_block,
                        offset=offset,
                        ftype="structural",
                        node_type=node_type,
                        submission_id=submission_id,
                        student_id=student_id,
                        assignment_id=assignment_id,
                    )
                    if frag:
                        fragments.append(frag)
                        # Slide if block is long
                        fragments.extend(
                            self._slide_over(frag, submission_id, student_id, assignment_id)
                        )
            except Exception as exc:
                logger.warning("Tree-sitter segmentation failed for %s: %s", ts_lang, exc)

        # ── 2. Regex fallback for C# or when Tree-sitter produced nothing ──
        if not fragments or ts_lang is None:
            blocks = self._extract_blocks_regex(source)
            for raw_block, offset in blocks:
                frag = self._make_fragment(
                    raw=raw_block,
                    offset=offset,
                    ftype="structural",
                    node_type="regex_block",
                    submission_id=submission_id,
                    student_id=student_id,
                    assignment_id=assignment_id,
                )
                if frag:
                    fragments.append(frag)
                    fragments.extend(
                        self._slide_over(frag, submission_id, student_id, assignment_id)
                    )

        # ── 3. Whole-file window fallback if still nothing ───────────────
        if not fragments:
            whole = self._make_fragment(
                raw=source,
                offset=0,
                ftype="whole_file",
                submission_id=submission_id,
                student_id=student_id,
                assignment_id=assignment_id,
            )
            if whole:
                fragments.append(whole)
                fragments.extend(
                    self._slide_over(whole, submission_id, student_id, assignment_id)
                )

        # Dedup by abstract token content
        seen: set[tuple[str, ...]] = set()
        unique: list[Fragment] = []
        for f in fragments:
            key = tuple(f.abstract_tokens)
            if key not in seen:
                seen.add(key)
                unique.append(f)

        return unique

    # ── Private helpers ────────────────────────────────────────────────────

    def _extract_structural_blocks(
        self, source: str, language: str
    ) -> list[tuple[str, str, int]]:
        """
        Walk the CST and collect (raw_source, node_type, byte_offset) for
        every node whose type is in ``_STRUCTURAL_BLOCK_TYPES``.
        """
        parser = self._tokenizer.parsers.get(language)
        if parser is None:
            return []

        try:
            code_bytes = source.encode("utf-8")
        except UnicodeEncodeError:
            code_bytes = source.encode("latin-1")

        tree = parser.parse(code_bytes)
        results: list[tuple[str, str, int]] = []
        self._walk(tree.root_node, code_bytes, results)
        return results

    def _walk(
        self,
        node,
        code_bytes: bytes,
        results: list[tuple[str, str, int]],
    ) -> None:
        if node.type in _STRUCTURAL_BLOCK_TYPES:
            text = code_bytes[node.start_byte: node.end_byte].decode("utf-8", errors="ignore")
            if text.strip():
                results.append((text, node.type, node.start_byte))
            # Don't recurse inside a matched block to avoid double-counting;
            # the sliding-window pass will handle sub-blocks.
            return
        for child in node.children:
            self._walk(child, code_bytes, results)

    def _extract_blocks_regex(
        self, source: str
    ) -> list[tuple[str, int]]:
        """
        Fallback block extractor using brace matching.

        Identifies top-level ``{ ... }`` blocks preceded by typical
        method/class/control-flow headers.
        """
        pattern = re.compile(
            r"(?:(?:public|private|protected|static|virtual|override|async|"
            r"void|int|string|bool|class|struct|interface|enum|def|for|while|if|foreach)\b[^{]*?)"
            r"(\{)",
            re.DOTALL | re.IGNORECASE,
        )
        results: list[tuple[str, int]] = []
        for m in pattern.finditer(source):
            start = m.start()
            brace_start = m.start(1)
            depth = 0
            end = brace_start
            for i, ch in enumerate(source[brace_start:], brace_start):
                if ch == "{":
                    depth += 1
                elif ch == "}":
                    depth -= 1
                    if depth == 0:
                        end = i + 1
                        break
            block = source[start:end]
            if block.strip():
                results.append((block, start))
        return results

    def _make_fragment(
        self,
        raw: str,
        offset: int,
        ftype: str,
        submission_id: str,
        student_id: str,
        assignment_id: str,
        node_type: Optional[str] = None,
    ) -> Optional[Fragment]:
        """Tokenize + map raw source; return Fragment or None if too short."""
        ts_lang = self.language if self.language in ("java", "python", "c") else "java"
        try:
            raw_tokens: list[str] = self._tokenizer.tokenize(
                raw, ts_lang, abstract_identifiers=False
            )
        except Exception:
            raw_tokens = raw.split()

        abstract = self._mapper.normalize_for_minhash(raw_tokens)
        if len(abstract) < 3:  # too short to be meaningful
            return None

        return Fragment(
            submission_id=submission_id,
            student_id=student_id,
            assignment_id=assignment_id,
            language=self.language,
            raw_source=raw,
            abstract_tokens=abstract,
            token_count=len(abstract),
            byte_offset=offset,
            fragment_type=ftype,
            node_type=node_type,
        )

    def _slide_over(
        self,
        parent: Fragment,
        submission_id: str,
        student_id: str,
        assignment_id: str,
    ) -> list[Fragment]:
        """
        Generate sliding-window sub-fragments for a parent fragment whose
        abstract token count exceeds ``SLIDING_WINDOW_MIN_TOKENS``.
        """
        tokens = parent.abstract_tokens
        if len(tokens) <= SLIDING_WINDOW_MIN_TOKENS:
            return []

        windows: list[Fragment] = []
        start = 0
        while start + WINDOW_SIZE <= len(tokens):
            window_tokens = tokens[start: start + WINDOW_SIZE]
            # Reconstruct a rough raw_source slice (best-effort)
            raw_approx = " ".join(window_tokens)
            w = Fragment(
                submission_id=submission_id,
                student_id=student_id,
                assignment_id=assignment_id,
                language=parent.language,
                raw_source=raw_approx,
                abstract_tokens=window_tokens,
                token_count=len(window_tokens),
                byte_offset=parent.byte_offset + start,
                fragment_type="window",
                node_type=parent.node_type,
            )
            windows.append(w)
            start += WINDOW_STRIDE

        return windows


# ────────────────────────────────────────────────────────────────────────────
# Template Filter
# ────────────────────────────────────────────────────────────────────────────

class TemplateFilter:
    """
    Discard fragments that closely match instructor skeleton code.

    Maintains a per-assignment registry of normalised token sets derived
    from the instructor's template.  Any student fragment whose Jaccard
    similarity vs any registered template fragment exceeds
    ``TEMPLATE_JACCARD_THRESHOLD`` is flagged and excluded.

    Usage
    -----
        tpf = TemplateFilter()
        tpf.register_template("hw3", instructor_source, "java")
        clean = tpf.filter(fragments)
    """

    def __init__(self, threshold: float = TEMPLATE_JACCARD_THRESHOLD) -> None:
        self._threshold = threshold
        # assignment_id → list of frozenset[str] (abstract token sets per template fragment)
        self._registry: dict[str, list[frozenset[str]]] = {}

    def register_template(
        self,
        assignment_id: str,
        source: str,
        language: str = "java",
    ) -> int:
        """
        Register instructor template code for an assignment.

        Returns the number of template fragments extracted.
        """
        fragmenter = Fragmenter(language)
        frags = fragmenter.segment(source, "template", "instructor", assignment_id)
        token_sets = [frozenset(f.abstract_tokens) for f in frags]
        self._registry.setdefault(assignment_id, []).extend(token_sets)
        logger.info(
            "Registered %d template fragments for assignment '%s'",
            len(frags),
            assignment_id,
        )
        return len(frags)

    def register_hashes(
        self,
        assignment_id: str,
        abstract_token_sets: Sequence[frozenset[str]],
    ) -> None:
        """Register pre-computed template token sets (e.g. loaded from DB)."""
        self._registry.setdefault(assignment_id, []).extend(abstract_token_sets)

    def is_template_match(self, fragment: Fragment) -> bool:
        """Return True if fragment matches any registered template fragment."""
        tsets = self._registry.get(fragment.assignment_id, [])
        if not tsets:
            return False
        fset = frozenset(fragment.abstract_tokens)
        for tset in tsets:
            jaccard = _jaccard(fset, tset)
            if jaccard >= self._threshold:
                return True
        return False

    def filter(self, fragments: list[Fragment]) -> list[Fragment]:
        """
        Filter out template fragments; mark the rest.

        Fragments that match the template have ``is_template = True`` and
        are excluded from the returned list.
        """
        clean: list[Fragment] = []
        for f in fragments:
            if self.is_template_match(f):
                f.is_template = True
                logger.debug(
                    "Fragment (sub=%s, off=%d) discarded: matches instructor template",
                    f.submission_id, f.byte_offset,
                )
            else:
                clean.append(f)
        return clean


# ────────────────────────────────────────────────────────────────────────────
# Helpers
# ────────────────────────────────────────────────────────────────────────────

def _jaccard(a: frozenset[str], b: frozenset[str]) -> float:
    if not a and not b:
        return 1.0
    union = len(a | b)
    if union == 0:
        return 0.0
    return len(a & b) / union
