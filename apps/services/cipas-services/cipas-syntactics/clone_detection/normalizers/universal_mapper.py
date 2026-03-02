"""
Universal Token Mapper — Phase 1 Normalization.

Maps language-specific CST node / token text to language-agnostic abstract
categories so that the Java-trained XGBoost model can process Python, C,
and C# submissions without retraining.

Abstract Categories (spec table):
──────────────────────────────────────────────────────────────────
 Category    │ Java          │ Python        │ C / C#
─────────────┼───────────────┼───────────────┼────────────────────
 VAR_DECL    │ int x =       │ x =           │ int x =
 ITERATION   │ for, while    │ for, while    │ for, while, do
 LITERAL     │ 42, "str"     │ 42, "str"     │ 42, "str"
 FUNC_CALL   │ obj.meth()    │ func()        │ func()
 CONDITION   │ if, ?: , switch│ if          │ if, switch, ?:
 RETURN      │ return        │ return        │ return
 IMPORT      │ import, using │ import, from  │ #include, using
 CLASS_DEF   │ class X       │ class X:      │ class X (C# only)
 FUNC_DEF    │ void foo()    │ def foo:      │ void foo()
 MODIFIER    │ public static │ —             │ static inline
 TYPE        │ int, String   │ —             │ int, char
──────────────────────────────────────────────────────────────────

Usage
-----
    from clone_detection.normalizers.universal_mapper import UniversalTokenMapper

    mapper = UniversalTokenMapper("python")
    abstract = mapper.map_token_stream(["def", "V", "(", "V", ")", ":", "return", "V"])
    # → ["FUNC_DEF", "V", "(", "V", ")", ":", "RETURN", "V"]

    # To normalise a CST node type (instead of token text):
    cat = mapper.map_node_type("for_statement", "python")
    # → "ITERATION"
"""

from __future__ import annotations

import re
from typing import Sequence

# ────────────────────────────────────────────────────────────────────────────
# Token-text → abstract category lookup tables (per language)
# ────────────────────────────────────────────────────────────────────────────

# Tokens that should **not** be replaced (structural punctuation / operators)
_PASSTHROUGH: frozenset[str] = frozenset(
    [
        "(", ")", "{", "}", "[", "]",
        ";", ",", ":", ".",
        "+", "-", "*", "/", "%",
        "=", "==", "!=", "<", ">", "<=", ">=",
        "&&", "||", "!", "&", "|", "^", "~",
        "<<", ">>", "++", "--",
        "+=", "-=", "*=", "/=", "%=",
        "->", "=>", "::", "...", "@",
    ]
)

# ── Java ───────────────────────────────────────────────────────────────────
_JAVA_MAP: dict[str, str] = {
    # VAR_DECL (primitive + reference type keywords + annotations that precede a declaration)
    "int": "VAR_DECL", "long": "VAR_DECL", "double": "VAR_DECL", "float": "VAR_DECL",
    "byte": "VAR_DECL", "short": "VAR_DECL", "char": "VAR_DECL", "boolean": "VAR_DECL",
    "String": "VAR_DECL", "var": "VAR_DECL", "final": "MODIFIER",
    # ITERATION
    "for": "ITERATION", "while": "ITERATION", "do": "ITERATION",
    # CONDITION
    "if": "CONDITION", "else": "CONDITION", "switch": "CONDITION", "case": "CONDITION",
    "default": "CONDITION",
    # RETURN
    "return": "RETURN",
    # IMPORT / PACKAGE
    "import": "IMPORT", "package": "IMPORT",
    # CLASS / INTERFACE
    "class": "CLASS_DEF", "interface": "CLASS_DEF", "enum": "CLASS_DEF",
    "extends": "MODIFIER", "implements": "MODIFIER",
    # FUNC_DEF related
    "void": "TYPE", "throws": "MODIFIER", "new": "FUNC_CALL",
    # MODIFIERS
    "public": "MODIFIER", "private": "MODIFIER", "protected": "MODIFIER",
    "static": "MODIFIER", "abstract": "MODIFIER", "synchronized": "MODIFIER",
    "native": "MODIFIER", "volatile": "MODIFIER", "transient": "MODIFIER",
    # EXCEPTION
    "try": "CONDITION", "catch": "CONDITION", "finally": "CONDITION",
    "throw": "RETURN",
    # MISC CONTROL
    "break": "CONTROL", "continue": "CONTROL", "assert": "CONTROL",
    "instanceof": "CONDITION", "super": "FUNC_CALL", "this": "FUNC_CALL",
    # LITERALS
    "true": "LITERAL", "false": "LITERAL", "null": "LITERAL",
}

# ── Python ─────────────────────────────────────────────────────────────────
_PYTHON_MAP: dict[str, str] = {
    # VAR_DECL (assignment-related; Python is untyped so we map common builtins)
    "int": "VAR_DECL", "str": "VAR_DECL", "float": "VAR_DECL", "bool": "VAR_DECL",
    "list": "VAR_DECL", "dict": "VAR_DECL", "set": "VAR_DECL", "tuple": "VAR_DECL",
    "bytes": "VAR_DECL",
    # ITERATION
    "for": "ITERATION", "while": "ITERATION",
    # CONDITION
    "if": "CONDITION", "elif": "CONDITION", "else": "CONDITION",
    "match": "CONDITION", "case": "CONDITION",
    # RETURN
    "return": "RETURN", "yield": "RETURN",
    # IMPORT
    "import": "IMPORT", "from": "IMPORT", "as": "IMPORT",
    # CLASS / FUNC DEF
    "class": "CLASS_DEF", "def": "FUNC_DEF", "lambda": "FUNC_DEF",
    "async": "MODIFIER", "await": "FUNC_CALL",
    # EXCEPTION
    "try": "CONDITION", "except": "CONDITION", "finally": "CONDITION",
    "raise": "RETURN", "with": "CONDITION",
    # MISC CONTROL
    "break": "CONTROL", "continue": "CONTROL", "pass": "CONTROL",
    "del": "CONTROL", "global": "MODIFIER", "nonlocal": "MODIFIER",
    # LITERALS
    "True": "LITERAL", "False": "LITERAL", "None": "LITERAL",
    # OPERATORS (word form)
    "and": "OPERATOR", "or": "OPERATOR", "not": "OPERATOR",
    "in": "CONDITION", "is": "CONDITION",
    # OBJECT ACCESS
    "self": "FUNC_CALL", "super": "FUNC_CALL",
}

# ── C ──────────────────────────────────────────────────────────────────────
_C_MAP: dict[str, str] = {
    # VAR_DECL
    "int": "VAR_DECL", "long": "VAR_DECL", "short": "VAR_DECL", "char": "VAR_DECL",
    "float": "VAR_DECL", "double": "VAR_DECL", "unsigned": "VAR_DECL",
    "signed": "VAR_DECL", "void": "VAR_DECL", "size_t": "VAR_DECL",
    "bool": "VAR_DECL", "_Bool": "VAR_DECL",
    # TYPE MODIFIERS
    "const": "MODIFIER", "extern": "MODIFIER", "static": "MODIFIER",
    "inline": "MODIFIER", "volatile": "MODIFIER", "register": "MODIFIER",
    "auto": "MODIFIER",
    # ITERATION
    "for": "ITERATION", "while": "ITERATION", "do": "ITERATION",
    # CONDITION
    "if": "CONDITION", "else": "CONDITION", "switch": "CONDITION",
    "case": "CONDITION", "default": "CONDITION",
    # RETURN
    "return": "RETURN",
    # IMPORT
    "#include": "IMPORT",
    # COMPOUND / TYPE
    "struct": "CLASS_DEF", "union": "CLASS_DEF", "enum": "CLASS_DEF",
    "typedef": "MODIFIER",
    # MEMORY
    "sizeof": "FUNC_CALL", "malloc": "FUNC_CALL", "calloc": "FUNC_CALL",
    "free": "FUNC_CALL", "realloc": "FUNC_CALL",
    # CONTROL FLOW
    "break": "CONTROL", "continue": "CONTROL", "goto": "CONTROL",
    # LITERALS
    "NULL": "LITERAL", "true": "LITERAL", "false": "LITERAL",
}

# ── C# ─────────────────────────────────────────────────────────────────────
_CSHARP_MAP: dict[str, str] = {
    # VAR_DECL
    "int": "VAR_DECL", "long": "VAR_DECL", "short": "VAR_DECL", "byte": "VAR_DECL",
    "double": "VAR_DECL", "float": "VAR_DECL", "decimal": "VAR_DECL",
    "char": "VAR_DECL", "bool": "VAR_DECL", "string": "VAR_DECL",
    "object": "VAR_DECL", "dynamic": "VAR_DECL", "var": "VAR_DECL",
    # MODIFIERS
    "public": "MODIFIER", "private": "MODIFIER", "protected": "MODIFIER",
    "internal": "MODIFIER", "static": "MODIFIER", "abstract": "MODIFIER",
    "sealed": "MODIFIER", "override": "MODIFIER", "virtual": "MODIFIER",
    "readonly": "MODIFIER", "const": "MODIFIER", "volatile": "MODIFIER",
    "async": "MODIFIER", "partial": "MODIFIER", "unsafe": "MODIFIER",
    "extern": "MODIFIER",
    # ITERATION
    "for": "ITERATION", "foreach": "ITERATION", "while": "ITERATION",
    "do": "ITERATION",
    # CONDITION
    "if": "CONDITION", "else": "CONDITION", "switch": "CONDITION",
    "case": "CONDITION", "default": "CONDITION", "when": "CONDITION",
    # RETURN
    "return": "RETURN", "yield": "RETURN",
    # IMPORT / NAMESPACE
    "using": "IMPORT", "namespace": "IMPORT",
    # CLASS / STRUCT / INTERFACE
    "class": "CLASS_DEF", "struct": "CLASS_DEF", "interface": "CLASS_DEF",
    "enum": "CLASS_DEF", "record": "CLASS_DEF", "delegate": "CLASS_DEF",
    "extends": "MODIFIER", "implements": "MODIFIER", "base": "FUNC_CALL",
    # EXCEPTION
    "try": "CONDITION", "catch": "CONDITION", "finally": "CONDITION",
    "throw": "RETURN",
    # CONTROL
    "break": "CONTROL", "continue": "CONTROL", "goto": "CONTROL",
    # MISC
    "new": "FUNC_CALL", "typeof": "FUNC_CALL", "sizeof": "FUNC_CALL",
    "this": "FUNC_CALL", "await": "FUNC_CALL", "lock": "CONDITION",
    "checked": "CONTROL", "unchecked": "CONTROL",
    "is": "CONDITION", "as": "CONDITION", "in": "CONDITION",
    "ref": "MODIFIER", "out": "MODIFIER", "params": "MODIFIER",
    # LITERALS
    "true": "LITERAL", "false": "LITERAL", "null": "LITERAL",
}

# Aggregate all maps by language key
_LANGUAGE_MAPS: dict[str, dict[str, str]] = {
    "java": _JAVA_MAP,
    "python": _PYTHON_MAP,
    "c": _C_MAP,
    "csharp": _CSHARP_MAP,
    "c#": _CSHARP_MAP,
}

# ────────────────────────────────────────────────────────────────────────────
# CST node-type → abstract category
# ────────────────────────────────────────────────────────────────────────────

_NODE_TYPE_MAP: dict[str, str] = {
    # VAR_DECL
    "local_variable_declaration": "VAR_DECL",
    "variable_declaration": "VAR_DECL",
    "variable_declarator": "VAR_DECL",
    "assignment_statement": "VAR_DECL",
    "assignment_expression": "VAR_DECL",
    "augmented_assignment": "VAR_DECL",
    "named_expression": "VAR_DECL",          # Python walrus :=
    "field_declaration": "VAR_DECL",
    # ITERATION
    "for_statement": "ITERATION",
    "while_statement": "ITERATION",
    "do_statement": "ITERATION",
    "enhanced_for_statement": "ITERATION",   # Java for-each
    "for_in_clause": "ITERATION",            # Python comprehension
    "foreach_statement": "ITERATION",        # C#
    # CONDITION
    "if_statement": "CONDITION",
    "switch_statement": "CONDITION",
    "switch_expression": "CONDITION",        # Java 14+
    "ternary_expression": "CONDITION",
    "conditional_expression": "CONDITION",
    "match_statement": "CONDITION",          # Python 3.10+
    # RETURN
    "return_statement": "RETURN",
    "yield_statement": "RETURN",
    "throw_statement": "RETURN",
    # FUNC_CALL
    "method_invocation": "FUNC_CALL",
    "call_expression": "FUNC_CALL",
    "function_call": "FUNC_CALL",            # C
    "invocation_expression": "FUNC_CALL",    # C#
    "object_creation_expression": "FUNC_CALL",
    # FUNC_DEF
    "method_declaration": "FUNC_DEF",
    "function_definition": "FUNC_DEF",       # Python / C
    "constructor_declaration": "FUNC_DEF",
    "local_function_statement": "FUNC_DEF",  # C#
    "lambda_expression": "FUNC_DEF",
    "arrow_function": "FUNC_DEF",
    # CLASS_DEF
    "class_declaration": "CLASS_DEF",
    "interface_declaration": "CLASS_DEF",
    "enum_declaration": "CLASS_DEF",
    "struct_specifier": "CLASS_DEF",         # C
    "record_declaration": "CLASS_DEF",       # C# / Java 16+
    # IMPORT
    "import_declaration": "IMPORT",
    "using_directive": "IMPORT",             # C#
    "preproc_include": "IMPORT",             # C
    # LITERAL
    "integer_literal": "LITERAL",
    "decimal_integer_literal": "LITERAL",
    "floating_point_literal": "LITERAL",
    "string_literal": "LITERAL",
    "character_literal": "LITERAL",
    "boolean_value": "LITERAL",              # Python True/False
    "none": "LITERAL",
    "null_literal": "LITERAL",
    # EXCEPTION
    "try_statement": "CONDITION",
    "catch_clause": "CONDITION",
    "finally_clause": "CONDITION",
}


# ────────────────────────────────────────────────────────────────────────────
# Regex patterns for runtime detection
# ────────────────────────────────────────────────────────────────────────────

_RE_INT   = re.compile(r"^[+-]?\d+[lLuU]*$")
_RE_FLOAT = re.compile(r"^[+-]?\d*\.\d+([eE][+-]?\d+)?[fFdD]?$")
_RE_HEX   = re.compile(r"^0[xX][0-9a-fA-F]+$")
_RE_STR   = re.compile(r'^(["\']).*\1$')
_RE_IDENT = re.compile(r"^[_a-zA-Z\u00C0-\uFFFF][_a-zA-Z0-9\u00C0-\uFFFF]*$")


class UniversalTokenMapper:
    """
    Translate language-specific tokens / CST node types to abstract categories.

    The same abstract token stream is then consumed by:
    - `MinHashIndexer`  (LSH bucketing)
    - `SyntacticFeatureExtractor`  (XGBoost features)
    - `StructuralNormalizer`  (Type-1/2 gate)
    """

    def __init__(self, language: str = "java") -> None:
        lang = language.lower().replace(" ", "")
        self._token_map: dict[str, str] = _LANGUAGE_MAPS.get(lang, _JAVA_MAP)
        self._language = lang

    # ── Public API ──────────────────────────────────────────────────────────

    def map_token(self, token: str) -> str:
        """
        Map a single token to its abstract category.

        Passthrough tokens (operators, delimiters) are returned unchanged.
        Known language keywords are mapped to their category name.
        Numeric and string literals → ``"LITERAL"``.
        Unknown identifiers → ``"V"`` (inheriting the existing convention).
        """
        # 1. Always pass structural characters through unchanged
        if token in _PASSTHROUGH:
            return token

        # 2. Language-specific keyword lookup (exact match)
        if token in self._token_map:
            return self._token_map[token]

        # 3. Preprocessor directive detection (#include, #define …)
        if token.startswith("#"):
            return "IMPORT"

        # 4. Numeric literal detection
        if _RE_INT.match(token) or _RE_FLOAT.match(token) or _RE_HEX.match(token):
            return "LITERAL"

        # 5. String / char literal
        if _RE_STR.match(token):
            return "LITERAL"

        # 6. Identifier → V (consistent with existing abstract_identifier)
        if _RE_IDENT.match(token):
            return "V"

        # 7. Unknown → pass through as-is (e.g. operator combinations)
        return token

    def map_token_stream(self, tokens: Sequence[str]) -> list[str]:
        """Map an entire token list, returning abstract tokens."""
        return [self.map_token(t) for t in tokens]

    @staticmethod
    def map_node_type(node_type: str, language: str = "java") -> str:  # noqa: ARG002
        """Return the abstract category for a CST node type string."""
        return _NODE_TYPE_MAP.get(node_type, "OTHER")

    def get_abstract_token_set(self, tokens: Sequence[str]) -> set[str]:
        """Return the *set* of abstract tokens for MinHash / Jaccard computation."""
        return set(self.map_token_stream(tokens))

    def normalize_for_minhash(self, tokens: Sequence[str]) -> list[str]:
        """
        Produce a compact, abstract token stream optimised for MinHash.

        Passthrough punctuation is dropped (it contributes mostly noise
        to MinHash Jaccard), retaining only the semantically meaningful
        abstract categories and abstracted identifiers.
        """
        result = []
        for t in tokens:
            mapped = self.map_token(t)
            # Drop pure punctuation noise for MinHash
            if mapped not in _PASSTHROUGH:
                result.append(mapped)
        return result
