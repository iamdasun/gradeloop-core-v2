# gradeloop-core-v2/apps/services/cipas-service/src/cipas/parsing/registry.py
"""
Language parser registry.

Provides a single point of truth for:
  - Language key → parser class mapping
  - File extension → Language mapping
  - Parser instance cache (one instance per language per process)
  - Registry validation at import time

Design decisions:
  - The registry is a module-level singleton dict. It is populated at import
    time and never mutated at runtime. Thread-safe and subprocess-safe by
    construction (no shared mutable state between processes).

  - Parser instances are cached in _INSTANCE_CACHE (module-level dict) so
    that calling get_parser_instance("python") twice returns the same object.
    This matters in the subprocess worker initialiser, which calls
    get_parser_instance() for each supported language. The cache ensures
    that repeated calls (e.g. during tests) do not reconstruct parsers.

  - The registry does NOT import concrete parser classes at module level.
    Imports are deferred to _load_parser_class() to keep the registry module
    importable in environments where tree-sitter is not installed (e.g.
    CI type-checking stages that don't install the full dep stack).

  - Adding a new language:
      1. Create cipas/parsing/xxx_parser.py with class XxxParser.
      2. Add Language.XXX = "xxx" to domain/models.py.
      3. Add the entry to _REGISTRY below.
      4. Add extension(s) to Language.from_extension() in domain/models.py.
      No other files need modification.

  - The registry validates that every registered class satisfies the
    LanguageParser Protocol at first access (not at import time) to avoid
    importing tree-sitter during module load.
"""

from __future__ import annotations

import os
from typing import TYPE_CHECKING, Any

from cipas.parsing.base import LanguageParser

if TYPE_CHECKING:
    # Only imported for type hints during static analysis.
    # At runtime these imports are deferred to _load_parser_class().
    from cipas.parsing.c_parser import CParser
    from cipas.parsing.java_parser import JavaParser
    from cipas.parsing.python_parser import PythonParser

# ---------------------------------------------------------------------------
# Registry definition
# ---------------------------------------------------------------------------
# Maps language key (str, matches Language enum value and tree-sitter-languages
# get_language() argument) to the dotted import path of the parser class.
#
# Using dotted import paths (not class references) avoids importing tree-sitter
# at registry module load time.  The concrete class is imported on first use.
#
# Format: "language_key": ("module_path", "ClassName")

_REGISTRY: dict[str, tuple[str, str]] = {
    "python": ("cipas.parsing.python_parser", "PythonParser"),
    "java": ("cipas.parsing.java_parser", "JavaParser"),
    "c": ("cipas.parsing.c_parser", "CParser"),
}

# ---------------------------------------------------------------------------
# Instance cache
# ---------------------------------------------------------------------------
# One LanguageParser instance per language per process.
# Populated lazily on first call to get_parser_instance().
# In worker subprocesses this is populated by _worker_initializer()
# (cipas/ingestion/worker.py) which calls get_parser_instance() for all
# supported languages during pool startup — amortising the grammar load cost.

_INSTANCE_CACHE: dict[str, Any] = {}


# ---------------------------------------------------------------------------
# Public API
# ---------------------------------------------------------------------------


def supported_languages() -> list[str]:
    """
    Return the list of supported language keys in registration order.

    Example: ["python", "java", "c"]
    """
    return list(_REGISTRY.keys())


def is_supported(language: str) -> bool:
    """
    Return True if `language` is a registered language key.

    Case-sensitive.  Use Language.value for enum-backed keys.

    Examples:
        is_supported("python")  → True
        is_supported("Python")  → False
        is_supported("kotlin")  → False
    """
    return language in _REGISTRY


def get_parser_instance(language: str) -> Any:
    """
    Return the cached LanguageParser instance for `language`.

    On first call for a given language:
      1. The parser class is imported from its module (deferred import).
      2. The class is validated against the LanguageParser Protocol.
      3. The class is instantiated (triggers tree-sitter grammar load + query
         compilation — approximately 5–50ms per language on cold start).
      4. The instance is stored in _INSTANCE_CACHE.

    Subsequent calls return the cached instance immediately (O(1) dict lookup).

    This function is safe to call from:
      - The event loop (to warm up the cache at startup, though not required).
      - The subprocess worker initialiser (primary use case).
      - Unit tests (direct calls for parser testing).

    Args:
        language: A registered language key (e.g. "python", "java", "c").

    Returns:
        A LanguageParser-conformant instance.

    Raises:
        KeyError: If `language` is not registered.
        ImportError: If the parser module cannot be imported (tree-sitter
            not installed, missing grammar, etc.).
        TypeError: If the loaded class does not satisfy the LanguageParser
            Protocol (developer error — caught at first use, not at import).
    """
    if language not in _REGISTRY:
        raise KeyError(
            f"Language {language!r} is not registered. "
            f"Supported languages: {supported_languages()!r}"
        )

    if language not in _INSTANCE_CACHE:
        parser_class = _load_parser_class(language)
        _validate_protocol(parser_class, language)
        _INSTANCE_CACHE[language] = parser_class()

    return _INSTANCE_CACHE[language]


def get_all_parser_instances() -> dict[str, Any]:
    """
    Return a dict of {language_key: parser_instance} for ALL registered languages.

    Forces instantiation of all parsers if they are not yet cached.
    Called by the worker subprocess initialiser to pre-warm all parsers
    in a single call rather than per-language.

    Returns:
        Dict mapping each supported language key to its parser instance.
    """
    return {lang: get_parser_instance(lang) for lang in _REGISTRY}


def detect_language(filename: str) -> str | None:
    """
    Detect the language key from a filename's extension.

    Uses Language.from_extension() for the mapping so the extension→language
    logic lives in one place (domain/models.py).

    Args:
        filename: A sanitised filename (basename only, no path components).
                  Extension matching is case-insensitive.

    Returns:
        A registered language key (e.g. "python") if the extension is
        supported, or None if the extension is not in the whitelist.

    Examples:
        detect_language("Main.java")    → "java"
        detect_language("solution.py")  → "python"
        detect_language("utils.c")      → "c"
        detect_language("utils.h")      → "c"
        detect_language("script.rb")    → None
        detect_language("README.md")    → None
    """
    # Import here to avoid circular: domain → parsing → domain.
    # domain/models.py does NOT import from parsing/, so this is safe.
    from cipas.domain.models import Language

    _, ext = os.path.splitext(filename)
    language = Language.from_extension(ext)
    if language is None:
        return None
    return language.value


def invalidate_cache() -> None:
    """
    Clear the parser instance cache.

    FOR TESTING ONLY.  Do not call in production code.

    Clears _INSTANCE_CACHE so that the next call to get_parser_instance()
    re-instantiates parsers from scratch.  Useful in tests that mock
    tree-sitter or need isolated parser instances.
    """
    _INSTANCE_CACHE.clear()


# ---------------------------------------------------------------------------
# Internal helpers
# ---------------------------------------------------------------------------


def _load_parser_class(language: str) -> type:
    """
    Import and return the parser class for `language`.

    Uses importlib to defer the import to the call site rather than module
    load time.  This keeps the registry importable without tree-sitter.

    Args:
        language: A registered language key.

    Returns:
        The parser class (uninstantiated).

    Raises:
        ImportError: If the module or class cannot be found.
    """
    import importlib

    module_path, class_name = _REGISTRY[language]
    try:
        module = importlib.import_module(module_path)
    except ImportError as exc:
        raise ImportError(
            f"Failed to import parser module {module_path!r} for language "
            f"{language!r}. Ensure tree-sitter and tree-sitter-languages "
            f"are installed: poetry install\nUnderlying error: {exc}"
        ) from exc

    try:
        parser_class: type = getattr(module, class_name)
    except AttributeError as exc:
        raise ImportError(
            f"Parser module {module_path!r} does not define class {class_name!r}. "
            f"This is a developer error — check the registry definition."
        ) from exc

    return parser_class


def _validate_protocol(parser_class: type, language: str) -> None:
    """
    Assert that `parser_class` satisfies the LanguageParser Protocol.

    Validates via isinstance(instance, LanguageParser) using the
    @runtime_checkable decorator on the Protocol.  This check is performed
    once at first instantiation; subsequent calls use the cache.

    Also validates that parser_class.language_key matches the registry key.

    Args:
        parser_class: The uninstantiated parser class to validate.
        language:     The registry key it is registered under.

    Raises:
        TypeError: If the class does not satisfy the Protocol or has a
                   mismatched language_key.
    """
    # Check language_key ClassVar.
    declared_key = getattr(parser_class, "language_key", None)
    if declared_key != language:
        raise TypeError(
            f"Parser class {parser_class.__name__!r} has language_key="
            f"{declared_key!r} but is registered under {language!r}. "
            f"These must match."
        )

    # Instantiate temporarily to check Protocol conformance.
    # We do this before caching so a misconfigured parser fails loudly at
    # first use (e.g. at worker startup) rather than silently returning
    # a broken instance.
    try:
        temp_instance = parser_class()
    except Exception as exc:
        raise TypeError(
            f"Failed to instantiate parser {parser_class.__name__!r} "
            f"for language {language!r}: {exc}"
        ) from exc

    if not isinstance(temp_instance, LanguageParser):
        missing: list[str] = []
        for attr in ("parse", "extract_raw_granules"):
            if not callable(getattr(temp_instance, attr, None)):
                missing.append(attr)
        raise TypeError(
            f"Parser {parser_class.__name__!r} does not satisfy the "
            f"LanguageParser Protocol. Missing or non-callable: {missing}. "
            f"Implement: parse(source: bytes) -> Tree and "
            f"extract_raw_granules(tree, source, *, max_nodes) -> list[RawGranule]."
        )

    # Store the validated instance directly to avoid double-instantiation.
    _INSTANCE_CACHE[language] = temp_instance


# ---------------------------------------------------------------------------
# Public exports
# ---------------------------------------------------------------------------

__all__ = [
    "supported_languages",
    "is_supported",
    "get_parser_instance",
    "get_all_parser_instances",
    "detect_language",
    "invalidate_cache",
]
