# gradeloop-core-v2/apps/services/cipas-service/src/cipas/parsing/__init__.py
"""
CIPAS parsing package.

Exposes the public interface for the language-agnostic parsing layer:

  - LanguageParser    Protocol that all concrete parsers must satisfy
  - RawGranule        Data-transfer type produced by parsers
  - GranuleSpan       Source-location span within a file
  - Registry helpers  get_parser_instance, detect_language, is_supported, etc.

Concrete parser classes (PythonParser, JavaParser, CParser) are NOT re-exported
here.  Callers should go through the registry rather than importing concrete
parsers directly.  This enforces the indirection that allows new languages to
be added without touching call sites.

Usage in worker subprocess:
    from cipas.parsing import get_all_parser_instances
    parsers = get_all_parser_instances()   # warms up all parsers once

Usage in tests:
    from cipas.parsing import get_parser_instance, LanguageParser
    parser = get_parser_instance("python")
    assert isinstance(parser, LanguageParser)
"""

from cipas.parsing.base import GranuleSpan, LanguageParser, RawGranule
from cipas.parsing.registry import (
    detect_language,
    get_all_parser_instances,
    get_parser_instance,
    invalidate_cache,
    is_supported,
    supported_languages,
)

__all__ = [
    # Abstractions from base
    "LanguageParser",
    "RawGranule",
    "GranuleSpan",
    # Registry helpers
    "get_parser_instance",
    "get_all_parser_instances",
    "detect_language",
    "is_supported",
    "supported_languages",
    "invalidate_cache",
]
