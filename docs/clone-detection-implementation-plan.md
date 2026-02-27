# Code Clone Detection System — Implementation Plan

> **Project:** GradeLoop Core V2 — CIPAS Track B (Semantic Clone Detection)  
> **Status:** Phase 1 Planning  
> **Last Updated:** February 25, 2026  
> **Owner:** Platform Engineering

---

## Table of Contents

1. [Executive Summary](#1-executive-summary)
2. [System Architecture Overview](#2-system-architecture-overview)
3. [Phase 1: Environment and Core Parser Setup](#3-phase-1-environment-and-core-parser-setup)
4. [Phase 2: The NiCAD Normalization Pipeline (Types 1 & 2)](#4-phase-2-the-nicad-normalization-pipeline-types-1--2)
5. [Phase 3: The ToMA IR and Feature Extraction (Type 3)](#5-phase-3-the-toma-ir-and-feature-extraction-type-3)
6. [Phase 4: Machine Learning and Scalability](#6-phase-4-machine-learning-and-scalability)
7. [Phase 5: Evaluation and Reporting](#7-phase-5-evaluation-and-reporting)
8. [Project Structure](#8-project-structure)
9. [Dependencies and Requirements](#9-dependencies-and-requirements)
10. [Timeline and Milestones](#10-timeline-and-milestones)
11. [Risk Mitigation](#11-risk-mitigation)
12. [Appendix: Dataset Reference](#12-appendix-dataset-reference)

---

## 1. Executive Summary

### 1.1 Purpose

This document outlines the implementation plan for a **language-agnostic code clone detection system** that combines:
- **Tree-sitter** for language-agnostic parsing and CST extraction
- **NiCAD** normalization techniques for Type-1 and Type-2 clone detection
- **ToMA (Token Mapping)** IR transformation for Type-3 clone detection
- **Machine Learning (Random Forest + FAISS)** for scalable similarity search

### 1.2 Clone Types Supported

| Type | Description | Detection Method | Example |
|------|-------------|------------------|---------|
| **Type-1** | Exact clones | Hash equality + noise removal | Copy-paste with whitespace changes |
| **Type-2** | Renamed clones | Blind renaming + LCS | Copy-paste with identifier/literal changes |
| **Type-3** | Modified clones | ToMA IR + ML classifier | Statements added/removed, refactored logic |
| **Type-4** | Semantic clones | (Future work) AST semantics + embeddings | Different syntax, same functionality |

### 1.3 Key Features

- **Language-agnostic**: Supports Java, C, Python via Tree-sitter grammars
- **Scalable**: FAISS approximate nearest neighbor search for O(log N) similarity lookup
- **ML-powered**: Random Forest classifier trained on BigCloneBench
- **Modular**: Clean separation between parsing, normalization, feature extraction, and classification
- **Production-ready**: Aligned with GradeLoop V2 backend patterns (async-first, pydantic-settings, structured logging)

### 1.4 Integration Points

```
┌─────────────────────────────────────────────────────────────────┐
│  GradeLoop V2 Ecosystem                                         │
│                                                                 │
│  ┌──────────────┐    ┌──────────────┐    ┌──────────────┐      │
│  │   IAM        │    │   Email      │    │   CIPAS      │      │
│  │   Service    │    │   Service    │    │   Service    │      │
│  │   (Go)       │    │   (Go)       │    │   (Python)   │      │
│  └──────────────┘    └──────────────┘    └──────────────┘      │
│                                                ▲                │
│                                                │                │
│                                    ┌───────────┴───────────┐    │
│                                    │  Clone Detection      │    │
│                                    │  Pipeline             │    │
│                                    │  (This System)        │    │
│                                    └───────────────────────┘    │
└─────────────────────────────────────────────────────────────────┘
```

---

## 2. System Architecture Overview

### 2.1 High-Level Pipeline

```
┌─────────────────────────────────────────────────────────────────────┐
│                     Clone Detection Pipeline                        │
└─────────────────────────────────────────────────────────────────────┘
                                    │
                                    ▼
┌─────────────────────────────────────────────────────────────────────┐
│  Stage 1: Parser Engine (Tree-sitter)                               │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐                  │
│  │   Java      │  │     C       │  │   Python    │                  │
│  │  Grammar    │  │   Grammar   │  │  Grammar    │                  │
│  │   (.so)     │  │    (.so)    │  │   (.so)     │                  │
│  └─────────────┘  └─────────────┘  └─────────────┘                  │
│              │            │              │                           │
│              └────────────┴──────────────┘                           │
│                           │                                          │
│                           ▼                                          │
│              ┌──────────────────────┐                                │
│              │   Fragmenter         │                                │
│              │   (Method-level)     │                                │
│              └──────────────────────┘                                │
└─────────────────────────────────────────────────────────────────────┘
                                    │
                                    ▼
┌─────────────────────────────────────────────────────────────────────┐
│  Stage 2: NiCAD Normalization (Type-1 & Type-2)                     │
│  ┌─────────────────────────────────────────────────────────────┐    │
│  │  Noise Removal: Strip comments, normalize whitespace        │    │
│  └─────────────────────────────────────────────────────────────┘    │
│  ┌─────────────────────────────────────────────────────────────┐    │
│  │  Pretty-Print: Canonical "one-statement-per-line" format    │    │
│  └─────────────────────────────────────────────────────────────┘    │
│  ┌─────────────────────────────────────────────────────────────┐    │
│  │  Blind Renaming: var1, var2, lit1, lit2                     │    │
│  └─────────────────────────────────────────────────────────────┘    │
│  ┌─────────────────────────────────────────────────────────────┐    │
│  │  LCS Matcher: Line-based Longest Common Subsequence         │    │
│  └─────────────────────────────────────────────────────────────┘    │
└─────────────────────────────────────────────────────────────────────┘
                                    │
                                    ▼
┌─────────────────────────────────────────────────────────────────────┐
│  Stage 3: ToMA IR Transformation (Type-3)                           │
│  ┌─────────────────────────────────────────────────────────────┐    │
│  │  ToMA Mapper: CST nodes → 15-type token schema              │    │
│  │  - qualified_name (Java) → QlfType                          │    │
│  │  - attribute (Python)  → QlfType                            │    │
│  │  - method_call         → CallType                           │    │
│  │  - ... (15 types total)                                     │    │
│  └─────────────────────────────────────────────────────────────┘    │
│  ┌─────────────────────────────────────────────────────────────┐    │
│  │  6D Feature Extractor                                       │    │
│  │  [Lev, LevRatio, Jaro, JW, Jaccard, Dice]                   │    │
│  └─────────────────────────────────────────────────────────────┘    │
└─────────────────────────────────────────────────────────────────────┘
                                    │
                                    ▼
┌─────────────────────────────────────────────────────────────────────┐
│  Stage 4: ML Classification & Scalability                           │
│  ┌─────────────────────────────────────────────────────────────┐    │
│  │  Inverted Index: Token → Fragment IDs                       │    │
│  └─────────────────────────────────────────────────────────────┘    │
│  ┌─────────────────────────────────────────────────────────────┐    │
│  │  FAISS Index: Approximate Nearest Neighbor Search (ANNS)    │    │
│  └─────────────────────────────────────────────────────────────┘    │
│  ┌─────────────────────────────────────────────────────────────┐    │
│  │  Random Forest Classifier: Clone vs Non-clone               │    │
│  └─────────────────────────────────────────────────────────────┘    │
└─────────────────────────────────────────────────────────────────────┘
                                    │
                                    ▼
┌─────────────────────────────────────────────────────────────────────┐
│  Stage 5: Evaluation & Reporting                                    │
│  ┌─────────────────────────────────────────────────────────────┐    │
│  │  BCB Evaluation: Precision, Recall, F1-score                │    │
│  └─────────────────────────────────────────────────────────────┘    │
│  ┌─────────────────────────────────────────────────────────────┐    │
│  │  Report Generator: JSON/HTML side-by-side comparison        │    │
│  └─────────────────────────────────────────────────────────────┘    │
└─────────────────────────────────────────────────────────────────────┘
```

### 2.2 Component Responsibilities

| Component | Module | Responsibility |
|-----------|--------|----------------|
| **ParserEngine** | `src/parser/engine.py` | Load Tree-sitter grammars, parse source code |
| **Fragmenter** | `src/parser/fragmenter.py` | Extract method-level code blocks via S-expression queries |
| **NoiseRemover** | `src/nicad/noise_removal.py` | Strip comments, normalize whitespace using CST |
| **PrettyPrinter** | `src/nicad/pretty_printer.py` | Reconstruct canonical code format |
| **BlindRenamer** | `src/nicad/blind_renamer.py` | Replace identifiers/literals with generic markers |
| **LCSMatcher** | `src/nicad/lcs_matcher.py` | Calculate Unpreprocessed Identity (UPI) |
| **ToMAMapper** | `src/toma/mapper.py` | Map CST nodes to 15-type token schema |
| **FeatureExtractor** | `src/toma/features.py` | Compute 6D similarity vector |
| **InvertedIndex** | `src/ml/inverted_index.py` | Token → Fragment ID mapping for pruning |
| **FAISSIndex** | `src/ml/faiss_index.py` | Approximate nearest neighbor search |
| **RandomForestClassifier** | `src/ml/classifier.py` | Train/predict clone pairs |
| **BCBEvaluator** | `src/evaluation/bcb_evaluator.py` | Evaluate against BigCloneBench ground truth |
| **ReportGenerator** | `src/evaluation/report_generator.py` | Generate JSON/HTML reports |

---

## 3. Phase 1: Environment and Core Parser Setup

**Duration:** 2 weeks  
**Goal:** Establish language-agnostic parsing foundation with Tree-sitter

### 3.1 Project Structure Setup

```bash
# Create modular folder structure
mkdir -p src/{parser,nicad,toma,ml,evaluation,config,storage}
mkdir -p config/
mkdir -p data/{models,indices,grammars}
mkdir -p tests/{unit,integration,e2e}
mkdir -p scripts/
```

**Directory Purpose:**

| Directory | Purpose |
|-----------|---------|
| `src/parser/` | Tree-sitter wrapper, grammar loading, fragment extraction |
| `src/nicad/` | NiCAD normalization pipeline (Type-1 & Type-2) |
| `src/toma/` | ToMA IR transformation and feature extraction (Type-3) |
| `src/ml/` | Machine learning models, FAISS indexing, classification |
| `src/evaluation/` | BCB evaluation scripts, report generation |
| `src/config/` | Configuration management (languages.yaml, thresholds) |
| `src/storage/` | Database models, repository patterns |
| `config/` | External configuration files |
| `data/models/` | Trained Random Forest models (serialized) |
| `data/indices/` | FAISS indices, inverted indices |
| `data/grammars/` | Compiled Tree-sitter grammar libraries (.so) |

### 3.2 Tree-sitter Grammar Configuration

**Step 1: Install Tree-sitter Python Binding**

```bash
# Add to requirements.txt or pyproject.toml
tree-sitter==0.21.3
tree-sitter-python==0.21.0
tree-sitter-java==0.21.0
tree-sitter-c==0.21.0
```

**Step 2: Clone and Compile Grammars**

```bash
# Script: scripts/setup_grammars.sh
#!/bin/bash
set -e

GRAMMARS_DIR="data/grammars"
mkdir -p $GRAMMARS_DIR

# Clone official grammars
git clone https://github.com/tree-sitter/tree-sitter-python.git $GRAMMARS_DIR/tree-sitter-python
git clone https://github.com/tree-sitter/tree-sitter-java.git $GRAMMARS_DIR/tree-sitter-java
git clone https://github.com/tree-sitter/tree-sitter-c.git $GRAMMARS_DIR/tree-sitter-c

# Build shared libraries
cd $GRAMMARS_DIR/tree-sitter-python && gcc -shared -fPIC -o libpython.so src/parser.c
cd $GRAMMARS_DIR/tree-sitter-java && gcc -shared -fPIC -o libjava.so src/parser.c
cd $GRAMMARS_DIR/tree-sitter-c && gcc -shared -fPIC -o libc.so src/parser.c

echo "✓ Grammars compiled successfully"
```

**Step 3: Language Configuration File**

Create `config/languages.yaml`:

```yaml
languages:
  python:
    name: "Python"
    grammar_path: "data/grammars/tree-sitter-python"
    library_file: "libpython.so"
    file_extensions:
      - ".py"
    fragment_queries:
      function: "(function_definition) @func"
      class: "(class_definition) @class"
      method: "(function_definition) @method"
    normalization_rules:
      strip_comments: true
      normalize_strings: true
      blind_rename_identifiers: true
      blind_rename_literals: true

  java:
    name: "Java"
    grammar_path: "data/grammars/tree-sitter-java"
    library_file: "libjava.so"
    file_extensions:
      - ".java"
    fragment_queries:
      method: "(method_declaration) @method"
      constructor: "(constructor_declaration) @constructor"
      class: "(class_declaration) @class"
    normalization_rules:
      strip_comments: true
      normalize_strings: true
      blind_rename_identifiers: true
      blind_rename_literals: true

  c:
    name: "C"
    grammar_path: "data/grammars/tree-sitter-c"
    library_file: "libc.so"
    file_extensions:
      - ".c"
      - ".h"
    fragment_queries:
      function: "(function_definition) @func"
    normalization_rules:
      strip_comments: true
      normalize_strings: true
      blind_rename_identifiers: true
      blind_rename_literals: true
```

### 3.3 ParserEngine Implementation

**File: `src/parser/engine.py`**

```python
"""
Tree-sitter Parser Engine for language-agnostic code parsing.
"""

from pathlib import Path
from typing import Dict, List, Optional
import yaml
from tree_sitter import Language, Parser


class ParserEngine:
    """
    Wrapper class to load Tree-sitter grammar libraries and parse source code.
    Supports multiple languages via dynamic grammar loading.
    """

    def __init__(self, config_path: str = "config/languages.yaml"):
        self.config = self._load_config(config_path)
        self.languages: Dict[str, Language] = {}
        self.parsers: Dict[str, Parser] = {}
        self._warmup()

    def _load_config(self, config_path: str) -> dict:
        """Load language configuration from YAML file."""
        with open(config_path, 'r') as f:
            return yaml.safe_load(f)

    def _warmup(self):
        """Pre-load all configured grammar libraries."""
        for lang_name, lang_config in self.config['languages'].items():
            self.load_language(lang_name)

    def load_language(self, language: str) -> Language:
        """
        Load a Tree-sitter grammar library for the specified language.

        Args:
            language: Language name (e.g., 'python', 'java', 'c')

        Returns:
            Loaded Tree-sitter Language object
        """
        if language not in self.config['languages']:
            raise ValueError(f"Unsupported language: {language}")

        if language in self.languages:
            return self.languages[language]

        lang_config = self.config['languages'][language]
        grammar_path = Path(lang_config['grammar_path'])
        library_file = grammar_path / lang_config['library_file']

        if not library_file.exists():
            raise FileNotFoundError(f"Grammar library not found: {library_file}")

        self.languages[language] = Language(library_file, language)
        self.parsers[language] = Parser()
        self.parsers[language].set_language(self.languages[language])

        return self.languages[language]

    def parse(self, source_code: bytes, language: str) -> 'Tree':
        """
        Parse source code and return the Concrete Syntax Tree (CST).

        Args:
            source_code: Source code as bytes
            language: Language name

        Returns:
            Tree-sitter Tree object containing the CST
        """
        if language not in self.parsers:
            self.load_language(language)

        parser = self.parsers[language]
        return parser.parse(source_code)

    def get_language_config(self, language: str) -> dict:
        """Get configuration for a specific language."""
        return self.config['languages'].get(language, {})
```

### 3.4 Fragmenter Implementation

**File: `src/parser/fragmenter.py`**

```python
"""
Fragmenter: Extract method-level code blocks using Tree-sitter S-expression queries.
"""

from typing import List, Dict, Optional
from dataclasses import dataclass
from tree_sitter import Tree, Node


@dataclass
class CodeFragment:
    """Represents an extracted code fragment (method/function level)."""
    fragment_id: str
    source_file: str
    language: str
    start_line: int
    end_line: int
    start_column: int
    end_column: int
    source_code: str
    fragment_type: str  # 'function', 'method', 'constructor', 'class'
    name: Optional[str] = None


class Fragmenter:
    """
    Extract method-level code fragments from parsed CST using S-expression queries.
    """

    def __init__(self, parser_engine: 'ParserEngine'):
        self.engine = parser_engine

    def extract_fragments(
        self,
        source_code: bytes,
        language: str,
        source_file: str,
        fragment_types: Optional[List[str]] = None
    ) -> List[CodeFragment]:
        """
        Extract code fragments from source code.

        Args:
            source_code: Source code as bytes
            language: Language name
            source_file: Path to source file
            fragment_types: Optional list of fragment types to extract
                           (default: all configured types)

        Returns:
            List of CodeFragment objects
        """
        tree = self.engine.parse(source_code, language)
        lang_config = self.engine.get_language_config(language)
        queries = lang_config.get('fragment_queries', {})

        if fragment_types is None:
            fragment_types = list(queries.keys())

        fragments = []
        fragment_counter = 0

        for frag_type in fragment_types:
            if frag_type not in queries:
                continue

            query = self.engine.languages[language].query(queries[frag_type])
            captures = query.captures(tree.root_node)

            for node, capture_name in captures:
                fragment = self._create_fragment(
                    node=node,
                    source_code=source_code,
                    language=language,
                    source_file=source_file,
                    fragment_type=frag_type,
                    fragment_counter=fragment_counter
                )
                if fragment:
                    fragments.append(fragment)
                    fragment_counter += 1

        return fragments

    def _create_fragment(
        self,
        node: Node,
        source_code: bytes,
        language: str,
        source_file: str,
        fragment_type: str,
        fragment_counter: int
    ) -> Optional[CodeFragment]:
        """Create a CodeFragment from a Tree-sitter node."""
        start_point = node.start_point
        end_point = node.end_point

        fragment_source = source_code[
            node.start_byte:node.end_byte
        ].decode('utf-8', errors='ignore')

        # Extract name if available
        name = self._extract_name(node, language)

        return CodeFragment(
            fragment_id=f"{fragment_type}_{fragment_counter}",
            source_file=source_file,
            language=language,
            start_line=start_point[0] + 1,  # 1-indexed
            end_line=end_point[0] + 1,
            start_column=start_point[1],
            end_column=end_point[1],
            source_code=fragment_source,
            fragment_type=fragment_type,
            name=name
        )

    def _extract_name(self, node: Node, language: str) -> Optional[str]:
        """Extract the name of a function/method/class from CST node."""
        # Language-specific name extraction
        name_node_types = {
            'python': ['identifier', 'attribute'],
            'java': ['identifier', 'string'],
            'c': ['identifier']
        }

        types_to_check = name_node_types.get(language, ['identifier'])

        for child in node.children:
            if child.type in types_to_check:
                return child.text.decode('utf-8', errors='ignore')

        return None
```

### 3.5 Deliverables Checklist

- [ ] `src/parser/engine.py` — ParserEngine wrapper class
- [ ] `src/parser/fragmenter.py` — Fragmenter with S-expression queries
- [ ] `config/languages.yaml` — Language configuration
- [ ] `scripts/setup_grammars.sh` — Grammar compilation script
- [ ] `tests/unit/test_parser_engine.py` — Unit tests for ParserEngine
- [ ] `tests/unit/test_fragmenter.py` — Unit tests for Fragmenter
- [ ] Compiled grammar libraries in `data/grammars/`

---

## 4. Phase 2: The NiCAD Normalization Pipeline (Types 1 & 2)

**Duration:** 3 weeks  
**Goal:** Implement high-precision Type-1 and Type-2 clone detection

### 4.1 Noise Removal

**File: `src/nicad/noise_removal.py`**

```python
"""
Noise Removal: Strip comments and normalize whitespace using Tree-sitter CST nodes.
"""

from typing import List
from tree_sitter import Node


class NoiseRemover:
    """
    Remove noise from code fragments using CST-based filtering.
    Operates on Tree-sitter CST nodes to preserve structural integrity.
    """

    # Language-specific comment node types
    COMMENT_NODE_TYPES = {
        'python': ['comment'],
        'java': ['line_comment', 'block_comment'],
        'c': ['comment']
    }

    # Whitespace normalization rules
    WHITESPACE_NORMALIZER = ' '

    def __init__(self, language: str):
        self.language = language
        self.comment_types = self.COMMENT_NODE_TYPES.get(language, ['comment'])

    def remove_noise(self, node: Node, source_code: bytes) -> str:
        """
        Remove comments and normalize whitespace from a CST node.

        Args:
            node: Tree-sitter CST node
            source_code: Original source code as bytes

        Returns:
            Normalized code string with noise removed
        """
        tokens = self._extract_tokens(node, source_code)
        return self.WHITESPACE_NORMALIZER.join(tokens)

    def _extract_tokens(self, node: Node, source_code: bytes) -> List[str]:
        """
        Recursively extract tokens from CST, excluding comments.

        Args:
            node: Current CST node
            source_code: Original source code

        Returns:
            List of token strings
        """
        tokens = []

        # Skip comment nodes
        if node.type in self.comment_types:
            return tokens

        # Leaf node (terminal)
        if node.child_count == 0:
            token = node.text.decode('utf-8', errors='ignore').strip()
            if token and not token.isspace():
                tokens.append(token)
        else:
            # Internal node: recurse into children
            for child in node.children:
                tokens.extend(self._extract_tokens(child, source_code))

        return tokens
```

### 4.2 Pretty-Printing

**File: `src/nicad/pretty_printer.py`**

```python
"""
Pretty-Printer: Reconstruct code from CST into canonical "one-statement-per-line" format.
"""

from typing import List
from tree_sitter import Node


class PrettyPrinter:
    """
    Reconstruct code from CST into a canonical format for clone comparison.
    Enforces "one-statement-per-line" formatting.
    """

    # Language-specific statement terminators
    STATEMENT_TERMINATORS = {
        'python': ['\n'],
        'java': [';'],
        'c': [';']
    }

    def __init__(self, language: str):
        self.language = language
        self.terminators = self.STATEMENT_TERMINATORS.get(language, [';'])

    def pretty_print(self, tokens: List[str]) -> str:
        """
        Reconstruct code from tokens into canonical format.

        Args:
            tokens: List of tokens from NoiseRemover

        Returns:
            Canonical code string (one statement per line)
        """
        lines = []
        current_line = []

        for token in tokens:
            current_line.append(token)

            # Check if this token ends a statement
            if token in self.terminators:
                lines.append(' '.join(current_line))
                current_line = []

        # Add remaining tokens as final line
        if current_line:
            lines.append(' '.join(current_line))

        return '\n'.join(lines)
```

### 4.3 Blind Renaming Logic

**File: `src/nicad/blind_renamer.py`**

```python
"""
Blind Renaming: Replace identifiers and literals with generic markers.
"""

from typing import Dict, List, Tuple
from tree_sitter import Node


class BlindRenamer:
    """
    Replace identifiers (variables, functions) and literals (numbers, strings)
    with generic markers to ignore naming variations.
    """

    # Language-specific identifier and literal node types
    NODE_TYPE_MAPPING = {
        'python': {
            'identifiers': ['identifier'],
            'literals': ['string', 'integer', 'float']
        },
        'java': {
            'identifiers': ['identifier'],
            'literals': ['string_literal', 'decimal_integer_literal',
                        'decimal_floating_point_literal', 'character_literal']
        },
        'c': {
            'identifiers': ['identifier'],
            'literals': ['string_literal', 'number_literal', 'char_literal']
        }
    }

    def __init__(self, language: str):
        self.language = language
        config = self.NODE_TYPE_MAPPING.get(language, {})
        self.identifier_types = set(config.get('identifiers', ['identifier']))
        self.literal_types = set(config.get('literals', []))

        # Renaming counters
        self.identifier_map: Dict[str, str] = {}
        self.literal_map: Dict[str, str] = {}
        self.identifier_counter = 1
        self.literal_counter = 1

    def reset(self):
        """Reset renaming maps for a new comparison."""
        self.identifier_map.clear()
        self.literal_map.clear()
        self.identifier_counter = 1
        self.literal_counter = 1

    def blind_rename(self, node: Node, source_code: bytes) -> str:
        """
        Apply blind renaming to CST node.

        Args:
            node: Tree-sitter CST node
            source_code: Original source code as bytes

        Returns:
            Renamed code string
        """
        tokens = self._rename_tokens(node, source_code)
        return ' '.join(tokens)

    def _rename_tokens(self, node: Node, source_code: bytes) -> List[str]:
        """Recursively extract and rename tokens."""
        tokens = []

        # Leaf node
        if node.child_count == 0:
            token_text = node.text.decode('utf-8', errors='ignore')

            if node.type in self.identifier_types:
                renamed = self._get_or_create_identifier(token_text)
                tokens.append(renamed)
            elif node.type in self.literal_types:
                renamed = self._get_or_create_literal(token_text)
                tokens.append(renamed)
            else:
                if token_text.strip():
                    tokens.append(token_text.strip())
        else:
            # Internal node: recurse
            for child in node.children:
                tokens.extend(self._rename_tokens(child, source_code))

        return tokens

    def _get_or_create_identifier(self, original: str) -> str:
        """Get existing renamed identifier or create new one."""
        if original not in self.identifier_map:
            self.identifier_map[original] = f"var{self.identifier_counter}"
            self.identifier_counter += 1
        return self.identifier_map[original]

    def _get_or_create_literal(self, original: str) -> str:
        """Get existing renamed literal or create new one."""
        if original not in self.literal_map:
            self.literal_map[original] = f"lit{self.literal_counter}"
            self.literal_counter += 1
        return self.literal_map[original]
```

### 4.4 LCS Matcher

**File: `src/nicad/lcs_matcher.py`**

```python
"""
LCS Matcher: Line-based Longest Common Subsequence for UPI calculation.
"""

from typing import Tuple, List
from difflib import SequenceMatcher


class LCSMatcher:
    """
    Calculate Unpreprocessed Identity (UPI) using line-based LCS algorithm.
    Optimized for speed using python-Levenshtein.
    """

    def __init__(self, similarity_threshold: float = 0.85):
        self.similarity_threshold = similarity_threshold

    def compute_upi(self, code_a: str, code_b: str) -> Tuple[float, int]:
        """
        Compute Unpreprocessed Identity (UPI) between two code fragments.

        Args:
            code_a: First normalized code string
            code_b: Second normalized code string

        Returns:
            Tuple of (similarity_score, lcs_length)
        """
        lines_a = code_a.strip().split('\n')
        lines_b = code_b.strip().split('\n')

        lcs_length = self._lcs_length(lines_a, lines_b)
        max_lines = max(len(lines_a), len(lines_b))

        if max_lines == 0:
            return 0.0, 0

        similarity = lcs_length / max_lines
        return similarity, lcs_length

    def _lcs_length(self, seq_a: List[str], seq_b: List[str]) -> int:
        """
        Compute LCS length using space-efficient DP (two-row variant).

        Args:
            seq_a: First sequence (lines)
            seq_b: Second sequence (lines)

        Returns:
            LCS length
        """
        m, n = len(seq_a), len(seq_b)

        # Ensure n is the smaller dimension for space optimization
        if m < n:
            seq_a, seq_b = seq_b, seq_a
            m, n = n, m

        # Two-row DP
        prev = [0] * (n + 1)

        for i in range(1, m + 1):
            curr = [0] * (n + 1)
            for j in range(1, n + 1):
                if seq_a[i - 1] == seq_b[j - 1]:
                    curr[j] = prev[j - 1] + 1
                else:
                    curr[j] = max(curr[j - 1], prev[j])
            prev = curr

        return prev[n]

    def is_clone(self, similarity: float) -> bool:
        """Check if similarity score meets threshold."""
        return similarity >= self.similarity_threshold
```

### 4.5 NiCAD Pipeline Integration

**File: `src/nicad/pipeline.py`**

```python
"""
NiCAD Normalization Pipeline: Orchestrates Type-1 and Type-2 clone detection.
"""

from typing import Tuple, Dict
from dataclasses import dataclass
from .noise_removal import NoiseRemover
from .pretty_printer import PrettyPrinter
from .blind_renamer import BlindRenamer
from .lcs_matcher import LCSMatcher
from ..parser.fragmenter import CodeFragment


@dataclass
class NiCADResult:
    """Result of NiCAD clone detection."""
    fragment_a_id: str
    fragment_b_id: str
    similarity_score: float
    lcs_length: int
    clone_type: str  # 'type1', 'type2', 'non-clone'
    is_clone: bool


class NiCADPipeline:
    """
    Complete NiCAD normalization pipeline for Type-1 and Type-2 clone detection.
    """

    def __init__(self, language: str, similarity_threshold: float = 0.85):
        self.language = language
        self.noise_remover = NoiseRemover(language)
        self.pretty_printer = PrettyPrinter(language)
        self.blind_renamer = BlindRenamer(language)
        self.lcs_matcher = LCSMatcher(similarity_threshold)

    def detect_clone(
        self,
        fragment_a: CodeFragment,
        fragment_b: CodeFragment,
        tree_a,  # Tree-sitter Tree
        tree_b:  # Tree-sitter Tree
    ) -> NiCADResult:
        """
        Detect if two fragments are Type-1 or Type-2 clones.

        Args:
            fragment_a: First code fragment
            fragment_b: Second code fragment
            tree_a: Parsed Tree-sitter Tree for fragment A
            tree_b: Parsed Tree-sitter Tree for fragment B

        Returns:
            NiCADResult with clone detection outcome
        """
        # Step 1: Noise removal and pretty-printing
        normalized_a = self._normalize(tree_a.root_node, fragment_a.source_code.encode())
        normalized_b = self._normalize(tree_b.root_node, fragment_b.source_code.encode())

        # Step 2: Type-1 check (exact match after normalization)
        if normalized_a == normalized_b:
            return NiCADResult(
                fragment_a_id=fragment_a.fragment_id,
                fragment_b_id=fragment_b.fragment_id,
                similarity_score=1.0,
                lcs_length=len(normalized_a.split('\n')),
                clone_type='type1',
                is_clone=True
            )

        # Step 3: Blind renaming for Type-2 detection
        self.blind_renamer.reset()
        renamed_a = self.blind_renamer.blind_rename(tree_a.root_node, fragment_a.source_code.encode())
        renamed_b = self.blind_renamer.blind_rename(tree_b.root_node, fragment_b.source_code.encode())

        # Step 4: LCS-based similarity (UPI)
        similarity, lcs_length = self.lcs_matcher.compute_upi(renamed_a, renamed_b)
        is_clone = self.lcs_matcher.is_clone(similarity)

        clone_type = 'type2' if is_clone else 'non-clone'

        return NiCADResult(
            fragment_a_id=fragment_a.fragment_id,
            fragment_b_id=fragment_b.fragment_id,
            similarity_score=similarity,
            lcs_length=lcs_length,
            clone_type=clone_type,
            is_clone=is_clone
        )

    def _normalize(self, node, source_code: bytes) -> str:
        """Apply noise removal and pretty-printing."""
        tokens = self.noise_remover.remove_noise(node, source_code)
        return self.pretty_printer.pretty_print(tokens.split())
```

### 4.6 Deliverables Checklist

- [ ] `src/nicad/noise_removal.py` — CST-based noise removal
- [ ] `src/nicad/pretty_printer.py` — Canonical code reconstruction
- [ ] `src/nicad/blind_renamer.py` — Identifier/literal renaming
- [ ] `src/nicad/lcs_matcher.py` — LCS-based UPI calculation
- [ ] `src/nicad/pipeline.py` — NiCAD pipeline orchestrator
- [ ] `tests/unit/test_nicad_pipeline.py` — Unit tests for NiCAD
- [ ] `tests/integration/test_type1_detection.py` — Type-1 clone detection tests
- [ ] `tests/integration/test_type2_detection.py` — Type-2 clone detection tests

---

## 5. Phase 3: The ToMA IR and Feature Extraction (Type 3)

**Duration:** 3 weeks  
**Goal:** Transform code into 15-type token sequences and extract 6D feature vectors

### 5.1 ToMA Mapper (15-Type Token Schema)

**File: `src/toma/mapper.py`**

```python
"""
ToMA Mapper: Map language-specific Tree-sitter nodes to 15-type token schema.
"""

from typing import Dict, List, Optional
from enum import Enum
from tree_sitter import Node


class TokenType(Enum):
    """15-type ToMA token schema."""
    # Control Flow
    IF = "IfType"
    ELSE = "ElseType"
    SWITCH = "SwitchType"
    CASE = "CaseType"
    FOR = "ForType"
    WHILE = "WhileType"
    DO = "DoType"
    BREAK = "BreakType"
    CONTINUE = "ContinueType"
    RETURN = "ReturnType"

    # Declarations
    VAR_DECL = "VarDeclType"
    FUNC_DECL = "FuncDeclType"
    PARAM = "ParamType"

    # Expressions
    CALL = "CallType"
    QLF = "QlfType"  # Qualified name (e.g., obj.method, package.Class)
```

**Continued:**

```python
# Token type mapping for different languages
TOKEN_TYPE_MAPPING = {
    'python': {
        'if_statement': TokenType.IF,
        'else_clause': TokenType.ELSE,
        'for_statement': TokenType.FOR,
        'while_statement': TokenType.WHILE,
        'return_statement': TokenType.RETURN,
        'break_statement': TokenType.BREAK,
        'continue_statement': TokenType.CONTINUE,
        'function_definition': TokenType.FUNC_DECL,
        'parameter': TokenType.PARAM,
        'assignment': TokenType.VAR_DECL,
        'call': TokenType.CALL,
        'attribute': TokenType.QLF,  # Python: obj.method → QlfType
        'identifier': TokenType.QLF,
    },
    'java': {
        'if_statement': TokenType.IF,
        'else_clause': TokenType.ELSE,
        'switch_statement': TokenType.SWITCH,
        'switch_block_statement_group': TokenType.CASE,
        'for_statement': TokenType.FOR,
        'enhanced_for_statement': TokenType.FOR,
        'while_statement': TokenType.WHILE,
        'do_statement': TokenType.DO,
        'break_statement': TokenType.BREAK,
        'continue_statement': TokenType.CONTINUE,
        'return_statement': TokenType.RETURN,
        'local_variable_declaration': TokenType.VAR_DECL,
        'method_declaration': TokenType.FUNC_DECL,
        'formal_parameter': TokenType.PARAM,
        'method_invocation': TokenType.CALL,
        'qualified_name': TokenType.QLF,  # Java: package.Class → QlfType
        'identifier': TokenType.QLF,
    },
    'c': {
        'if_statement': TokenType.IF,
        'else_clause': TokenType.ELSE,
        'switch_statement': TokenType.SWITCH,
        'case_statement': TokenType.CASE,
        'for_statement': TokenType.FOR,
        'while_statement': TokenType.WHILE,
        'do_statement': TokenType.DO,
        'break_statement': TokenType.BREAK,
        'continue_statement': TokenType.CONTINUE,
        'return_statement': TokenType.RETURN,
        'declaration': TokenType.VAR_DECL,
        'function_definition': TokenType.FUNC_DECL,
        'parameter_declaration': TokenType.PARAM,
        'call_expression': TokenType.CALL,
        'identifier': TokenType.QLF,
    }
}


class ToMAMapper:
    """
    Map language-specific Tree-sitter CST nodes to 15-type ToMA token sequence.
    """

    def __init__(self, language: str):
        self.language = language
        self.mapping = TOKEN_TYPE_MAPPING.get(language, {})

    def map_to_tokens(self, node: Node) -> List[TokenType]:
        """
        Recursively map CST node to ToMA token sequence.

        Args:
            node: Tree-sitter CST node

        Returns:
            List of TokenType enums
        """
        tokens = []

        # Check if current node type maps to a token type
        if node.type in self.mapping:
            tokens.append(self.mapping[node.type])

        # Recurse into children
        for child in node.children:
            tokens.extend(self.map_to_tokens(child))

        return tokens

    def map_fragment(self, node: Node, source_code: bytes) -> List[str]:
        """
        Map a code fragment to string token sequence.

        Args:
            node: CST node
            source_code: Original source code

        Returns:
            List of token type strings (e.g., ['IfType', 'CallType', 'QlfType'])
        """
        tokens = self.map_to_tokens(node)
        return [t.value for t in tokens]
```

### 5.2 6D Feature Extractor

**File: `src/toma/features.py`**

```python
"""
6D Feature Extractor: Compute similarity vector for ML classification.
"""

from typing import List, Tuple
import Levenshtein  # python-Levenshtein


class FeatureExtractor:
    """
    Extract 6-dimensional feature vector from two token sequences.
    Vector: [Lev, LevRatio, Jaro, JW, Jaccard, Dice]
    """

    def extract_features(
        self,
        tokens_a: List[str],
        tokens_b: List[str]
    ) -> Tuple[float, float, float, float, float, float]:
        """
        Extract 6D feature vector from two token sequences.

        Args:
            tokens_a: First token sequence
            tokens_b: Second token sequence

        Returns:
            Tuple of (Lev, LevRatio, Jaro, JW, Jaccard, Dice)
        """
        # Convert to strings for Levenshtein functions
        str_a = ' '.join(tokens_a)
        str_b = ' '.join(tokens_b)

        # 1. Levenshtein distance
        lev = Levenshtein.distance(str_a, str_b)

        # 2. Levenshtein ratio (normalized)
        lev_ratio = Levenshtein.ratio(str_a, str_b)

        # 3. Jaro similarity
        jaro = Levenshtein.jaro(str_a, str_b)

        # 4. Jaro-Winkler similarity
        jw = Levenshtein.jaro_winkler(str_a, str_b)

        # 5. Jaccard similarity
        set_a = set(tokens_a)
        set_b = set(tokens_b)
        intersection = len(set_a & set_b)
        union = len(set_a | set_b)
        jaccard = intersection / union if union > 0 else 0.0

        # 6. Dice coefficient
        dice = (2 * intersection) / (len(set_a) + len(set_b)) if (len(set_a) + len(set_b)) > 0 else 0.0

        return (lev, lev_ratio, jaro, jw, jaccard, dice)

    def extract_features_batch(
        self,
        fragment_pairs: List[Tuple[List[str], List[str]]]
    ) -> List[Tuple[float, float, float, float, float, float]]:
        """
        Extract features for multiple fragment pairs.

        Args:
            fragment_pairs: List of (tokens_a, tokens_b) tuples

        Returns:
            List of 6D feature vectors
        """
        return [self.extract_features(a, b) for a, b in fragment_pairs]
```

### 5.3 ToMA Pipeline Integration

**File: `src/toma/pipeline.py`**

```python
"""
ToMA Pipeline: Orchestrates Type-3 clone detection via IR transformation.
"""

from typing import List, Tuple
from dataclasses import dataclass
from .mapper import ToMAMapper
from .features import FeatureExtractor
from ..parser.fragmenter import CodeFragment


@dataclass
class ToMAResult:
    """Result of ToMA feature extraction."""
    fragment_a_id: str
    fragment_b_id: str
    tokens_a: List[str]
    tokens_b: List[str]
    feature_vector: Tuple[float, float, float, float, float, float]


class ToMAPipeline:
    """
    Complete ToMA pipeline for Type-3 clone feature extraction.
    """

    def __init__(self, language: str):
        self.language = language
        self.mapper = ToMAMapper(language)
        self.extractor = FeatureExtractor()

    def extract_features(
        self,
        fragment_a: CodeFragment,
        fragment_b: CodeFragment,
        tree_a,  # Tree-sitter Tree
        tree_b:  # Tree-sitter Tree
    ) -> ToMAResult:
        """
        Extract ToMA features from two code fragments.

        Args:
            fragment_a: First code fragment
            fragment_b: Second code fragment
            tree_a: Parsed Tree for fragment A
            tree_b: Parsed Tree for fragment B

        Returns:
            ToMAResult with token sequences and 6D feature vector
        """
        # Map to token sequences
        tokens_a = self.mapper.map_fragment(tree_a.root_node, fragment_a.source_code.encode())
        tokens_b = self.mapper.map_fragment(tree_b.root_node, fragment_b.source_code.encode())

        # Extract 6D features
        feature_vector = self.extractor.extract_features(tokens_a, tokens_b)

        return ToMAResult(
            fragment_a_id=fragment_a.fragment_id,
            fragment_b_id=fragment_b.fragment_id,
            tokens_a=tokens_a,
            tokens_b=tokens_b,
            feature_vector=feature_vector
        )
```

### 5.4 Deliverables Checklist

- [ ] `src/toma/mapper.py` — ToMA 15-type token mapping
- [ ] `src/toma/features.py` — 6D feature extraction
- [ ] `src/toma/pipeline.py` — ToMA pipeline orchestrator
- [ ] `tests/unit/test_toma_mapper.py` — Token mapping tests
- [ ] `tests/unit/test_feature_extractor.py` — Feature extraction tests
- [ ] `requirements.txt` update: Add `python-Levenshtein==0.23.0`

---

## 6. Phase 4: Machine Learning and Scalability

**Duration:** 4 weeks  
**Goal:** Enable large-scale clone detection with ML classification and indexing

### 6.1 Inverted Index for Search Pruning

**File: `src/ml/inverted_index.py`**

```python
"""
Inverted Index: Token → Fragment ID mapping for search space pruning.
"""

from typing import Dict, List, Set
from collections import defaultdict


class InvertedIndex:
    """
    Create and query inverted index for efficient fragment retrieval.
    Keys are unique tokens, values are lists of fragment IDs containing them.
    """

    def __init__(self):
        self.index: Dict[str, Set[str]] = defaultdict(set)
        self.fragment_tokens: Dict[str, List[str]] = {}

    def add_fragment(self, fragment_id: str, tokens: List[str]):
        """
        Add a fragment to the inverted index.

        Args:
            fragment_id: Unique fragment identifier
            tokens: Token sequence for the fragment
        """
        self.fragment_tokens[fragment_id] = tokens
        for token in tokens:
            self.index[token].add(fragment_id)

    def add_fragments(self, fragments: List[tuple]):
        """
        Add multiple fragments to the index.

        Args:
            fragments: List of (fragment_id, tokens) tuples
        """
        for fragment_id, tokens in fragments:
            self.add_fragment(fragment_id, tokens)

    def get_candidates(self, query_tokens: List[str], min_overlap: int = 1) -> Set[str]:
        """
        Find candidate fragments that share tokens with query.

        Args:
            query_tokens: Token sequence to match against
            min_overlap: Minimum number of shared tokens required

        Returns:
            Set of candidate fragment IDs
        """
        token_counts: Dict[str, int] = defaultdict(int)

        for token in query_tokens:
            if token in self.index:
                for fragment_id in self.index[token]:
                    token_counts[fragment_id] += 1

        # Filter by minimum overlap
        candidates = {
            frag_id for frag_id, count in token_counts.items()
            if count >= min_overlap
        }

        return candidates

    def get_index_stats(self) -> dict:
        """Get statistics about the inverted index."""
        return {
            'total_tokens': len(self.index),
            'total_fragments': len(self.fragment_tokens),
            'avg_posting_length': sum(len(v) for v in self.index.values()) / max(len(self.index), 1)
        }
```

### 6.2 FAISS Index for Approximate Nearest Neighbor Search

**File: `src/ml/faiss_index.py`**

```python
"""
FAISS Index: Approximate Nearest Neighbor Search for 6D vectors.
"""

from typing import List, Tuple
import numpy as np
import faiss


class FAISSIndex:
    """
    FAISS-based Approximate Nearest Neighbor Search (ANNS) for 6D feature vectors.
    Enables O(log N) similarity lookup.
    """

    def __init__(self, dimension: int = 6, index_type: str = 'IVF'):
        """
        Initialize FAISS index.

        Args:
            dimension: Feature vector dimension (default: 6)
            index_type: Index type ('IVF', 'HNSW', 'Flat')
        """
        self.dimension = dimension
        self.index_type = index_type
        self.index = None
        self.fragment_ids: List[str] = []
        self._initialize_index()

    def _initialize_index(self):
        """Initialize FAISS index based on type."""
        if self.index_type == 'IVF':
            # IVF (Inverted File Index) for medium-scale datasets
            quantizer = faiss.IndexFlatL2(self.dimension)
            nlist = 100  # Number of Voronoi cells
            self.index = faiss.IndexIVFFlat(quantizer, self.dimension, nlist, faiss.METRIC_L2)
        elif self.index_type == 'HNSW':
            # HNSW for high-accuracy ANN
            M = 16  # Number of connections per layer
            self.index = faiss.IndexHNSWFlat(self.dimension, M, faiss.METRIC_L2)
        else:
            # Flat index (exact search, small datasets)
            self.index = faiss.IndexFlatL2(self.dimension)

    def train(self, vectors: np.ndarray):
        """
        Train the index (required for IVF).

        Args:
            vectors: Training vectors (N x dimension)
        """
        if self.index_type == 'IVF':
            self.index.train(vectors)

    def add(self, vectors: np.ndarray, fragment_ids: List[str]):
        """
        Add vectors to the index.

        Args:
            vectors: Feature vectors to add (N x dimension)
            fragment_ids: Corresponding fragment IDs
        """
        if self.index_type == 'IVF' and not self.index.is_trained:
            self.train(vectors)

        self.index.add(vectors)
        self.fragment_ids.extend(fragment_ids)

    def search(
        self,
        query_vector: np.ndarray,
        k: int = 10
    ) -> List[Tuple[str, float]]:
        """
        Search for k nearest neighbors.

        Args:
            query_vector: Query feature vector (1 x dimension)
            k: Number of neighbors to retrieve

        Returns:
            List of (fragment_id, distance) tuples
        """
        distances, indices = self.index.search(query_vector.reshape(1, -1), k)

        results = []
        for dist, idx in zip(distances[0], indices[0]):
            if idx < len(self.fragment_ids):
                results.append((self.fragment_ids[idx], float(dist)))

        return results

    def save(self, path: str):
        """Save index to disk."""
        faiss.write_index(self.index, path)

    def load(self, path: str):
        """Load index from disk."""
        self.index = faiss.read_index(path)
```

### 6.3 Random Forest Classifier

**File: `src/ml/classifier.py`**

```python
"""
Random Forest Classifier: Train and predict clone pairs.
"""

from typing import List, Tuple, Optional
import numpy as np
from sklearn.ensemble import RandomForestClassifier
from sklearn.model_selection import train_test_split
from sklearn.metrics import classification_report, confusion_matrix
import joblib
from pathlib import Path


class RandomForestClassifier:
    """
    Random Forest classifier for clone detection.
    Trained on BigCloneBench (BCB) data.
    """

    def __init__(
        self,
        n_estimators: int = 100,
        max_depth: int = 10,
        random_state: int = 42
    ):
        """
        Initialize Random Forest classifier.

        Args:
            n_estimators: Number of trees in the forest
            max_depth: Maximum depth of each tree
            random_state: Random seed for reproducibility
        """
        self.n_estimators = n_estimators
        self.max_depth = max_depth
        self.random_state = random_state
        self.model = RandomForestClassifier(
            n_estimators=n_estimators,
            max_depth=max_depth,
            random_state=random_state,
            n_jobs=-1  # Use all CPU cores
        )
        self.is_trained = False

    def train(
        self,
        X: np.ndarray,
        y: np.ndarray,
        test_size: float = 0.2
    ) -> dict:
        """
        Train the classifier.

        Args:
            X: Feature matrix (N x 6)
            y: Labels (0 = non-clone, 1 = clone)
            test_size: Fraction of data for validation

        Returns:
            Training metrics dictionary
        """
        # Split into train/validation
        X_train, X_val, y_train, y_val = train_test_split(
            X, y, test_size=test_size, random_state=self.random_state, stratify=y
        )

        # Train
        self.model.fit(X_train, y_train)
        self.is_trained = True

        # Evaluate
        y_pred = self.model.predict(X_val)

        metrics = {
            'accuracy': float(np.mean(y_pred == y_val)),
            'classification_report': classification_report(y_val, y_pred),
            'confusion_matrix': confusion_matrix(y_val, y_pred).tolist()
        }

        return metrics

    def predict(self, X: np.ndarray) -> np.ndarray:
        """
        Predict clone labels for feature vectors.

        Args:
            X: Feature matrix (N x 6)

        Returns:
            Predicted labels (0 or 1)
        """
        if not self.is_trained:
            raise RuntimeError("Model must be trained before prediction")

        return self.model.predict(X)

    def predict_proba(self, X: np.ndarray) -> np.ndarray:
        """
        Predict clone probabilities.

        Args:
            X: Feature matrix (N x 6)

        Returns:
            Probability matrix (N x 2)
        """
        if not self.is_trained:
            raise RuntimeError("Model must be trained before prediction")

        return self.model.predict_proba(X)

    def save(self, path: str):
        """Save trained model to disk."""
        Path(path).parent.mkdir(parents=True, exist_ok=True)
        joblib.dump(self.model, path)

    def load(self, path: str):
        """Load trained model from disk."""
        self.model = joblib.load(path)
        self.is_trained = True
```

### 6.4 Training Data Generation from BigCloneBench

**File: `src/ml/bcb_training.py`**

```python
"""
Training Data Generator: Prepare BigCloneBench data for ML training.
"""

from typing import List, Tuple
import pandas as pd
import numpy as np
from pathlib import Path


class BCBTrainingGenerator:
    """
    Generate training pairs from BigCloneBench dataset.
    """

    def __init__(self, bcb_path: str):
        """
        Initialize with BigCloneBench path.

        Args:
            bcb_path: Path to BigCloneBench dataset directory
        """
        self.bcb_path = Path(bcb_path)
        self.clone_pairs_path = self.bcb_path / 'clonePairs.csv'
        self.code_path = self.bcb_path / 'code'

    def load_clone_pairs(self) -> pd.DataFrame:
        """Load BigCloneBench clone pair labels."""
        df = pd.read_csv(self.clone_pairs_path)
        return df

    def generate_training_data(
        self,
        feature_extractor: 'FeatureExtractor',
        sample_size: int = 10000
    ) -> Tuple[np.ndarray, np.ndarray]:
        """
        Generate training data (features + labels).

        Args:
            feature_extractor: ToMA FeatureExtractor instance
            sample_size: Number of pairs to sample

        Returns:
            Tuple of (X: features, y: labels)
        """
        # Load clone pairs
        clones_df = self.load_clone_pairs()

        # Sample pairs
        sampled_clones = clones_df.sample(n=sample_size, random_state=42)

        X = []
        y = []

        for _, row in sampled_clones.iterrows():
            # Load code fragments
            code_a = self._load_code(row['clone1Id'])
            code_b = self._load_code(row['clone2Id'])

            # Extract features
            features = feature_extractor.extract_features(code_a, code_b)
            X.append(features)

            # Label (1 = clone, 0 = non-clone)
            y.append(1)

        # TODO: Add non-clone pairs for balanced dataset

        return np.array(X), np.array(y)

    def _load_code(self, fragment_id: str) -> List[str]:
        """Load code fragment from BigCloneBench."""
        # Implementation depends on BCB file structure
        pass
```

### 6.5 Deliverables Checklist

- [ ] `src/ml/inverted_index.py` — Inverted index implementation
- [ ] `src/ml/faiss_index.py` — FAISS ANNNS index
- [ ] `src/ml/classifier.py` — Random Forest classifier
- [ ] `src/ml/bcb_training.py` — BCB training data generator
- [ ] `data/models/` directory for serialized models
- [ ] `data/indices/` directory for FAISS indices
- [ ] `tests/unit/test_inverted_index.py` — Index tests
- [ ] `tests/unit/test_faiss_index.py` — FAISS tests
- [ ] `tests/integration/test_classifier_training.py` — Training integration tests
- [ ] `requirements.txt` update: Add `scikit-learn==1.3.0`, `faiss-cpu==1.7.4`, `joblib==1.3.0`

---

## 7. Phase 5: Evaluation and Reporting

**Duration:** 2 weeks  
**Goal:** Evaluate against BigCloneBench and generate reports

### 7.1 BigCloneBench Evaluation Script

**File: `src/evaluation/bcb_evaluator.py`**

```python
"""
BCB Evaluator: Evaluate clone detection against BigCloneBench ground truth.
"""

from typing import Dict, List, Tuple
from dataclasses import dataclass
from sklearn.metrics import precision_score, recall_score, f1_score
import numpy as np


@dataclass
class EvaluationMetrics:
    """Evaluation metrics for clone detection."""
    precision: float
    recall: float
    f1_score: float
    true_positives: int
    false_positives: int
    false_negatives: int
    true_negatives: int


class BCBEvaluator:
    """
    Evaluate clone detection pipeline against BigCloneBench ground truth.
    Calculates Precision, Recall, and F1-score for ST3, MT3, WT3 categories.
    """

    def __init__(self, ground_truth_path: str):
        """
        Initialize with BigCloneBench ground truth.

        Args:
            ground_truth_path: Path to BCB ground truth file
        """
        self.ground_truth_path = ground_truth_path
        self.ground_truth = self._load_ground_truth()

    def _load_ground_truth(self) -> Dict[Tuple[str, str], int]:
        """Load ground truth clone pairs."""
        # Returns dict: {(frag_a, frag_b): label}
        pass

    def evaluate(
        self,
        predictions: List[Tuple[str, str, float]],
        clone_type: str = 'all'
    ) -> EvaluationMetrics:
        """
        Evaluate predictions against ground truth.

        Args:
            predictions: List of (frag_a, frag_b, score) tuples
            clone_type: Filter by clone type ('ST3', 'MT3', 'WT3', 'all')

        Returns:
            EvaluationMetrics object
        """
        y_true = []
        y_pred = []

        for frag_a, frag_b, score in predictions:
            # Get ground truth label
            gt_label = self.ground_truth.get((frag_a, frag_b), 0)

            # Apply threshold
            pred_label = 1 if score >= 0.85 else 0

            y_true.append(gt_label)
            y_pred.append(pred_label)

        # Calculate metrics
        tp = sum(1 for t, p in zip(y_true, y_pred) if t == 1 and p == 1)
        fp = sum(1 for t, p in zip(y_true, y_pred) if t == 0 and p == 1)
        fn = sum(1 for t, p in zip(y_true, y_pred) if t == 1 and p == 0)
        tn = sum(1 for t, p in zip(y_true, y_pred) if t == 0 and p == 0)

        precision = precision_score(y_true, y_pred, zero_division=0)
        recall = recall_score(y_true, y_pred, zero_division=0)
        f1 = f1_score(y_true, y_pred, zero_division=0)

        return EvaluationMetrics(
            precision=precision,
            recall=recall,
            f1_score=f1,
            true_positives=tp,
            false_positives=fp,
            false_negatives=fn,
            true_negatives=tn
        )

    def evaluate_by_type(
        self,
        predictions: List[Tuple[str, str, float]]
    ) -> Dict[str, EvaluationMetrics]:
        """
        Evaluate separately for ST3, MT3, WT3 categories.

        Args:
            predictions: List of predictions

        Returns:
            Dict mapping clone type to EvaluationMetrics
        """
        results = {}

        for clone_type in ['ST3', 'MT3', 'WT3']:
            # Filter predictions by type
            type_predictions = self._filter_by_type(predictions, clone_type)
            results[clone_type] = self.evaluate(type_predictions, clone_type)

        return results
```

### 7.2 Report Generator

**File: `src/evaluation/report_generator.py`**

```python
"""
Report Generator: Produce JSON/HTML reports with side-by-side comparisons.
"""

from typing import List, Dict
from dataclasses import dataclass, asdict
import json
from pathlib import Path
from datetime import datetime


@dataclass
class CloneMatch:
    """Represents a detected clone pair."""
    fragment_a_id: str
    fragment_b_id: str
    fragment_a_source: str
    fragment_b_source: str
    similarity_score: float
    clone_type: str  # 'type1', 'type2', 'type3'
    feature_vector: tuple


class ReportGenerator:
    """
    Generate JSON and HTML reports for clone detection results.
    """

    def __init__(self, output_dir: str = "reports"):
        self.output_dir = Path(output_dir)
        self.output_dir.mkdir(parents=True, exist_ok=True)

    def generate_json_report(
        self,
        matches: List[CloneMatch],
        metrics: dict,
        filename: str = "clone_report.json"
    ) -> str:
        """
        Generate JSON report.

        Args:
            matches: List of detected clone matches
            metrics: Evaluation metrics
            filename: Output filename

        Returns:
            Path to generated report
        """
        report = {
            'metadata': {
                'generated_at': datetime.now().isoformat(),
                'total_matches': len(matches),
                'metrics': metrics
            },
            'clone_matches': [asdict(m) for m in matches]
        }

        output_path = self.output_dir / filename
        with open(output_path, 'w') as f:
            json.dump(report, f, indent=2)

        return str(output_path)

    def generate_html_report(
        self,
        matches: List[CloneMatch],
        metrics: dict,
        filename: str = "clone_report.html"
    ) -> str:
        """
        Generate HTML report with side-by-side comparisons.

        Args:
            matches: List of detected clone matches
            metrics: Evaluation metrics
            filename: Output filename

        Returns:
            Path to generated report
        """
        html = self._build_html(matches, metrics)

        output_path = self.output_dir / filename
        with open(output_path, 'w') as f:
            f.write(html)

        return str(output_path)

    def _build_html(self, matches: List[CloneMatch], metrics: dict) -> str:
        """Build HTML report content."""
        html = """
        <!DOCTYPE html>
        <html>
        <head>
            <title>Clone Detection Report</title>
            <style>
                body { font-family: Arial, sans-serif; margin: 20px; }
                .metrics { background: #f0f0f0; padding: 20px; margin-bottom: 20px; }
                .match { border: 1px solid #ccc; margin: 10px 0; padding: 10px; }
                .code-block {
                    background: #f8f8f8;
                    border: 1px solid #ddd;
                    padding: 10px;
                    font-family: monospace;
                    white-space: pre-wrap;
                    overflow-x: auto;
                }
                .side-by-side {
                    display: flex;
                    gap: 20px;
                }
                .code-column { flex: 1; }
                .score { font-weight: bold; color: #0066cc; }
                .type1 { border-left: 4px solid #28a745; }
                .type2 { border-left: 4px solid #ffc107; }
                .type3 { border-left: 4px solid #dc3545; }
            </style>
        </head>
        <body>
            <h1>Clone Detection Report</h1>

            <div class="metrics">
                <h2>Summary Metrics</h2>
                <p><strong>Total Matches:</strong> """ + str(len(matches)) + """</p>
                <p><strong>Precision:</strong> """ + str(metrics.get('precision', 'N/A')) + """</p>
                <p><strong>Recall:</strong> """ + str(metrics.get('recall', 'N/A')) + """</p>
                <p><strong>F1-Score:</strong> """ + str(metrics.get('f1_score', 'N/A')) + """</p>
            </div>

            <h2>Clone Matches</h2>
        """

        for match in matches:
            html += f"""
            <div class="match {match.clone_type}">
                <h3>Match: {match.fragment_a_id} ↔ {match.fragment_b_id}</h3>
                <p><span class="score">Similarity: {match.similarity_score:.4f}</span> | Type: {match.clone_type.upper()}</p>

                <div class="side-by-side">
                    <div class="code-column">
                        <h4>Fragment A ({match.fragment_a_id})</h4>
                        <div class="code-block">{self._escape_html(match.fragment_a_source)}</div>
                    </div>
                    <div class="code-column">
                        <h4>Fragment B ({match.fragment_b_id})</h4>
                        <div class="code-block">{self._escape_html(match.fragment_b_source)}</div>
                    </div>
                </div>
            </div>
            """

        html += """
        </body>
        </html>
        """

        return html

    def _escape_html(self, text: str) -> str:
        """Escape HTML special characters."""
        return (text
                .replace('&', '&amp;')
                .replace('<', '&lt;')
                .replace('>', '&gt;')
                .replace('"', '&quot;'))
```

### 7.3 Deliverables Checklist

- [ ] `src/evaluation/bcb_evaluator.py` — BCB evaluation script
- [ ] `src/evaluation/report_generator.py` — JSON/HTML report generator
- [ ] `scripts/evaluate_bcb.sh` — BCB evaluation runner
- [ ] `reports/` directory for generated reports
- [ ] `tests/integration/test_bcb_evaluation.py` — Evaluation integration tests
- [ ] Sample HTML report in `docs/examples/clone_report.html`

---

## 8. Project Structure

### 8.1 Final Directory Layout

```
/home/iamdasun/Projects/4yrg/gradeloop-core-v2/
├── apps/
│   └── services/
│       └── clone-detection-service/       # New Python service
│           ├── src/
│           │   ├── parser/
│           │   │   ├── engine.py
│           │   │   └── fragmenter.py
│           │   ├── nicad/
│           │   │   ├── noise_removal.py
│           │   │   ├── pretty_printer.py
│           │   │   ├── blind_renamer.py
│           │   │   ├── lcs_matcher.py
│           │   │   └── pipeline.py
│           │   ├── toma/
│           │   │   ├── mapper.py
│           │   │   ├── features.py
│           │   │   └── pipeline.py
│           │   ├── ml/
│           │   │   ├── inverted_index.py
│           │   │   ├── faiss_index.py
│           │   │   ├── classifier.py
│           │   │   └── bcb_training.py
│           │   ├── evaluation/
│           │   │   ├── bcb_evaluator.py
│           │   │   └── report_generator.py
│           │   ├── config/
│           │   │   └── settings.py
│           │   ├── storage/
│           │   │   └── repository.py
│           │   └── api/
│           │       ├── routes.py
│           │       └── deps.py
│           ├── config/
│           │   └── languages.yaml
│           ├── data/
│           │   ├── models/
│           │   ├── indices/
│           │   └── grammars/
│           ├── tests/
│           │   ├── unit/
│           │   ├── integration/
│           │   └── e2e/
│           ├── scripts/
│           │   ├── setup_grammars.sh
│           │   └── evaluate_bcb.sh
│           ├── pyproject.toml
│           ├── requirements.txt
│           ├── Dockerfile
│           └── README.md
├── datasets/
│   ├── bigclonebench/                    # BCB dataset (to be populated)
│   │   ├── clonePairs.csv
│   │   └── code/
│   └── toma-dataset/
│       ├── id2sourcecode/                # Java source files (DO NOT READ)
│       ├── clone.csv
│       ├── nonclone.csv
│       ├── type-1.csv
│       ├── type-2.csv
│       ├── type-3.csv
│       ├── type-4.csv
│       └── type-5.csv
├── docs/
│   └── clone-detection-implementation-plan.md  # This document
└── reports/                              # Generated reports
```

---

## 9. Dependencies and Requirements

### 9.1 Python Dependencies

**File: `apps/services/clone-detection-service/requirements.txt`**

```txt
# Core
fastapi==0.104.1
uvicorn[standard]==0.24.0
pydantic==2.5.0
pydantic-settings==2.1.0

# Tree-sitter
tree-sitter==0.21.3
tree-sitter-python==0.21.0
tree-sitter-java==0.21.0
tree-sitter-c==0.21.0

# Machine Learning
scikit-learn==1.3.0
faiss-cpu==1.7.4
python-Levenshtein==0.23.0
joblib==1.3.0

# Data Processing
pandas==2.1.0
numpy==1.24.0
pyyaml==6.0.1

# Logging
loguru==0.7.2

# Testing
pytest==7.4.0
pytest-cov==4.1.0
pytest-asyncio==0.21.0

# Utilities
aiofiles==23.2.1
httpx==0.25.0
```

### 9.2 System Requirements

| Component | Minimum | Recommended |
|-----------|---------|-------------|
| CPU | 4 cores | 8+ cores |
| RAM | 8 GB | 16+ GB |
| Storage | 10 GB | 50+ GB (for datasets) |
| Python | 3.11+ | 3.12 |

---

## 10. Timeline and Milestones

### 10.1 Phase Breakdown

| Phase | Duration | Start Date | End Date | Deliverables |
|-------|----------|------------|----------|--------------|
| **Phase 1** | 2 weeks | Week 1-2 | Parser Engine, Fragmenter, Grammar setup |
| **Phase 2** | 3 weeks | Week 3-5 | NiCAD Pipeline (Type-1 & Type-2) |
| **Phase 3** | 3 weeks | Week 6-8 | ToMA IR, Feature Extraction (Type-3) |
| **Phase 4** | 4 weeks | Week 9-12 | ML models, FAISS, Inverted Index |
| **Phase 5** | 2 weeks | Week 13-14 | BCB Evaluation, Report Generator |

### 10.2 Milestone Checkpoints

**Milestone 1 (Week 2): Parser Foundation**
- [ ] ParserEngine loads all 3 grammars
- [ ] Fragmenter extracts method-level blocks
- [ ] Unit tests pass (>90% coverage)

**Milestone 2 (Week 5): NiCAD Complete**
- [ ] Type-1 detection (exact clones) working
- [ ] Type-2 detection (renamed clones) working
- [ ] LCS-based UPI calculation accurate

**Milestone 3 (Week 8): ToMA IR Ready**
- [ ] 15-type token mapping complete
- [ ] 6D feature extraction working
- [ ] Integration tests pass

**Milestone 4 (Week 12): ML Pipeline Operational**
- [ ] Random Forest trained on BCB data
- [ ] FAISS index enables O(log N) search
- [ ] Inverted index prunes search space

**Milestone 5 (Week 14): Production Ready**
- [ ] BCB evaluation shows F1 > 0.85
- [ ] HTML/JSON reports generated
- [ ] Docker container builds successfully
- [ ] Documentation complete

---

## 11. Risk Mitigation

### 11.1 Technical Risks

| Risk | Probability | Impact | Mitigation Strategy |
|------|-------------|--------|---------------------|
| Tree-sitter grammar compilation fails | Medium | High | Pre-compiled binaries as fallback |
| ML model underperforms on BCB | Medium | High | Hyperparameter tuning, ensemble methods |
| FAISS index memory overflow | Low | Medium | Use IVF index, batch processing |
| Performance bottlenecks in LCS | High | Medium | Parallel processing with ProcessPoolExecutor |
| BigCloneBench dataset incompatible | Low | High | Manual data cleaning scripts, alternative datasets |

### 11.2 Operational Risks

| Risk | Probability | Impact | Mitigation Strategy |
|------|-------------|--------|---------------------|
| Scope creep (Type-4 semantic clones) | Medium | Medium | Defer to Phase 2, focus on Type-1/2/3 |
| Team resource constraints | Medium | High | Prioritize core features, defer reporting |
| Integration with GradeLoop V2 delays | Low | Medium | Decouple service, use async communication |

---

## 12. Appendix: Dataset Reference

### 12.1 TOMA Dataset Structure

**Location:** `datasets/toma-dataset/`

| File | Description | Lines | Format |
|------|-------------|-------|--------|
| `clone.csv` | All clone pairs | 270,001 | `id1,id2,type,sim1,sim2` |
| `type-1.csv` | Type-1 clones | 48,117 | `id1,id2,type,sim1,sim2` |
| `type-2.csv` | Type-2 clones | - | Same format |
| `type-3.csv` | Type-3 clones | 21,396 | Same format |
| `type-4.csv` | Type-4 clones | - | Same format |
| `type-5.csv` | Type-5 clones | - | Same format |
| `nonclone.csv` | Non-clone pairs | - | Same format |
| `id2sourcecode/` | Java source files | ~20 shown | `.java` files |

**Sample Data (clone.csv):**
```csv
20601756,23594635,3,0.578947368421053,0.802919708029197
8001867,23594635,3,0.578947368421053,0.737226277372263
```

**Columns:**
1. `id1`: First fragment ID
2. `id2`: Second fragment ID
3. `type`: Clone type (1-5)
4. `sim1`: Similarity metric 1
5. `sim2`: Similarity metric 2

### 12.2 BigCloneBench Dataset

**Location:** `datasets/bigclonebench/` (to be populated)

**Expected Structure:**
```
bigclonebench/
├── clonePairs.csv          # Ground truth clone pairs
├── code/                   # Source code files
│   ├── train/
│   ├── test/
│   └── validation/
└── README.txt              # Dataset documentation
```

**Download:** [BigCloneBench Dataset](https://github.com/clonebench/BigCloneBench)

### 12.3 Dataset Usage Guidelines

⚠️ **IMPORTANT:** Do NOT read files in `datasets/toma-dataset/id2sourcecode/` directly during planning. These contain raw Java source code that should only be accessed through the ParserEngine during runtime.

**Correct Usage:**
```python
# Use ParserEngine to parse files
parser = ParserEngine()
fragments = fragmenter.extract_fragments(
    source_code=file_bytes,
    language='java',
    source_file='datasets/toma-dataset/id2sourcecode/10000061.java'
)
```

---

## 13. Next Steps

1. **Review and Approve Plan**
   - Share this document with the team
   - Gather feedback on timeline and scope
   - Adjust milestones as needed

2. **Setup Development Environment**
   - Run `scripts/setup_grammars.sh`
   - Install Python dependencies
   - Verify Tree-sitter grammar compilation

3. **Begin Phase 1 Implementation**
   - Create project structure
   - Implement ParserEngine
   - Implement Fragmenter
   - Write unit tests

4. **Weekly Check-ins**
   - Review progress against milestones
   - Address blockers promptly
   - Adjust priorities if needed

---

**Document Owner:** Platform Engineering  
**Last Updated:** February 25, 2026  
**Version:** 1.0

---

*This implementation plan is aligned with GradeLoop V2 backend patterns (async-first, pydantic-settings, structured logging, production-ready code). All code should follow the guidelines in `CONTRIBUTING.md` and service-specific READMEs.*
