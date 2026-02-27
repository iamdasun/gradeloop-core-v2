# AST Extraction Guide

This document describes how ACAFS Service extracts Abstract Syntax Trees (AST) from source code.

## Supported Languages

| Language | tree-sitter Grammar | File Extensions |
|----------|--------------------|-----------------|
| C | tree-sitter-c | .c, .h |
| C++ | tree-sitter-cpp | .cpp, .hpp, .cc |
| Java | tree-sitter-java | .java |
| Python | tree-sitter-python | .py |
| JavaScript | tree-sitter-javascript | .js |
| C# | tree-sitter-c-sharp | .cs |

## Extraction Process

### 1. Code Retrieval

Source code is retrieved from either:
- The `code` field in the RabbitMQ message (if present)
- MinIO object storage using `storage_path`

### 2. Preprocessing

- **Truncation**: Files over 5000 lines are truncated
- **Encoding**: UTF-8 sanitization
- **Metadata**: Line count tracking

### 3. Parsing

- **Timeout**: 2-second timeout per parse
- **Parser Selection**: Based on `language` or `language_id`
- **Tree Traversal**: Recursive node analysis

### 4. Blueprint Generation

Extracted elements:

#### Functions
```json
{
  "name": "function_name",
  "parameters": [...],
  "return_type": "int",
  "line_start": 10,
  "line_end": 25
}
```

#### Classes
```json
{
  "name": "ClassName",
  "methods": [...],
  "fields": [...],
  "line_start": 5,
  "line_end": 50
}
```

#### Variables
```json
{
  "name": "variable_name",
  "type": "string",
  "line": 15
}
```

#### Control Flow
```json
{
  "type": "if_statement",
  "line": 20
}
```

#### Imports
```json
{
  "module": "module_name",
  "line": 1
}
```

## Deterministic Output

To ensure identical code produces byte-identical JSON:

1. **Sorted Keys**: All dictionaries use consistent key ordering
2. **Stable Traversal**: AST nodes processed in source order
3. **No Timestamps**: Output excludes non-deterministic data
4. **Truncation Flag**: `ast_truncated` indicates if code was cut

## Error Handling

### Parse Failures

When parsing fails, the system stores:

```json
{
  "parse_error": "parser_timeout",
  "details": {
    "timeout_seconds": 2
  }
}
```

Failure reasons:
- `unsupported_language`: Language not in supported list
- `parser_timeout`: Exceeded 2-second limit
- `parse_error`: Generic parsing failure
- `empty_source_code`: No code available

### Dead Letter Queue

Failed messages are routed to `acafs.evaluation.dead` for inspection.

## Performance Considerations

- **Memory**: < 50MB per worker
- **Concurrency**: Limited to CPU core count
- **Batch Size**: Single message processing (no batching)
- **Database**: Upsert on conflict (idempotent)

## Schema Versioning

The `schema_version` field follows semantic versioning:

- `1.0.0`: Initial schema
- Future versions will increment for breaking changes
