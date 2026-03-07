"""AST parser using tree-sitter for code analysis."""

import concurrent.futures
import time
from typing import Any, Optional

from tree_sitter import Node, Parser, Tree

from app.config import get_settings
from app.logging_config import get_logger
from app.schemas import ASTBlueprint, ASTMetadata
from app.services.evaluation.language_router import LanguageRouter

logger = get_logger(__name__)


class ASTParser:
    """Parser for extracting structural blueprints from source code."""

    def __init__(self):
        """Initialize AST parser with language router."""
        self.language_router = LanguageRouter()
        self.settings = get_settings()

    def parse(
        self,
        code: str,
        language: str,
        language_id: Optional[int] = None,
    ) -> ASTBlueprint:
        """Parse source code and extract AST blueprint.
        
        Args:
            code: Source code to parse
            language: Programming language name
            language_id: Optional Judge0 language ID
            
        Returns:
            ASTBlueprint containing structural analysis
        """
        start_time = time.time()
        
        # Check code size and truncate if necessary
        lines = code.splitlines()
        total_lines = len(lines)
        ast_truncated = False
        
        if total_lines > self.settings.ast_max_lines:
            lines = lines[: self.settings.ast_max_lines]
            code = "\n".join(lines)
            ast_truncated = True
            logger.warning(
                "code_truncated",
                original_lines=total_lines,
                truncated_to=self.settings.ast_max_lines,
            )

        # Get appropriate parser
        parser = self.language_router.get_parser(language)
        if not parser and language_id:
            parser = self.language_router.get_parser_by_judge0_id(language_id)
        
        if not parser:
            logger.error("no_parser_available", language=language, language_id=language_id)
            return self._create_error_blueprint(
                language=language,
                reason="unsupported_language",
                ast_truncated=ast_truncated,
                lines=total_lines,
            )

        try:
            # Parse with timeout
            tree = self._parse_with_timeout(parser, code)
            if tree is None:
                return self._create_error_blueprint(
                    language=language,
                    reason="parser_timeout",
                    ast_truncated=ast_truncated,
                    lines=total_lines,
                )

            # Extract structural elements
            blueprint = self._extract_blueprint(tree, language)
            blueprint.metadata.ast_truncated = ast_truncated
            blueprint.metadata.lines_of_code = total_lines
            blueprint.metadata.extraction_duration_ms = (time.time() - start_time) * 1000

            logger.info(
                "ast_parsed",
                language=language,
                functions=len(blueprint.functions),
                classes=len(blueprint.classes),
                duration_ms=blueprint.metadata.extraction_duration_ms,
            )

            return blueprint

        except Exception as e:
            logger.error("parse_error", language=language, error=str(e))
            return self._create_error_blueprint(
                language=language,
                reason="parse_error",
                ast_truncated=ast_truncated,
                lines=total_lines,
                error_details={"error": str(e)},
            )

    def _parse_with_timeout(self, parser: Parser, code: str) -> Optional[Tree]:
        """Parse code with timeout protection.

        Uses a dedicated thread so this method is safe to call from any thread,
        including threads spawned by ThreadPoolExecutor (where signal.SIGALRM
        is unavailable — it only works on the main OS thread).

        Args:
            parser: Tree-sitter parser
            code: Source code

        Returns:
            Parse tree or None if timeout / error
        """
        with concurrent.futures.ThreadPoolExecutor(max_workers=1) as executor:
            future = executor.submit(parser.parse, bytes(code, "utf-8"))
            try:
                return future.result(timeout=self.settings.ast_timeout_seconds)
            except concurrent.futures.TimeoutError:
                logger.error(
                    "parse_timeout",
                    timeout_seconds=self.settings.ast_timeout_seconds,
                )
                future.cancel()
                return None
            except Exception as exc:
                logger.error("parse_error_in_thread", error=str(exc))
                return None

    def _extract_blueprint(self, tree: Tree, language: str) -> ASTBlueprint:
        """Extract structural blueprint from parse tree.
        
        Args:
            tree: Tree-sitter parse tree
            language: Programming language
            
        Returns:
            ASTBlueprint with extracted elements
        """
        root = tree.root_node
        
        functions = []
        classes = []
        variables = []
        control_flow = []
        operators = []
        imports = []

        self._traverse_node(root, {
            "functions": functions,
            "classes": classes,
            "variables": variables,
            "control_flow": control_flow,
            "operators": operators,
            "imports": imports,
        })

        return ASTBlueprint(
            language=language,
            functions=functions,
            classes=classes,
            variables=variables,
            control_flow=control_flow,
            operators=operators,
            imports=imports,
            metadata=ASTMetadata(),
        )

    def _traverse_node(self, node: Node, collectors: dict[str, list]) -> None:
        """Traverse AST nodes and collect structural elements.
        
        Args:
            node: Current AST node
            collectors: Dictionary of lists to collect elements
        """
        node_type = node.type

        # Function detection
        if node_type in ("function_definition", "function_declaration", "method_definition"):
            func_info = self._extract_function_info(node)
            if func_info:
                collectors["functions"].append(func_info)

        # Class detection
        elif node_type in ("class_definition", "class_declaration", "struct_specifier"):
            class_info = self._extract_class_info(node)
            if class_info:
                collectors["classes"].append(class_info)

        # Variable detection
        elif node_type in ("variable_declaration", "declaration", "assignment"):
            var_info = self._extract_variable_info(node)
            if var_info:
                collectors["variables"].append(var_info)

        # Control flow detection
        elif node_type in (
            "if_statement", "for_statement", "while_statement",
            "do_statement", "switch_statement", "try_statement",
            "with_statement", "for_in_statement"
        ):
            cf_info = self._extract_control_flow_info(node)
            if cf_info:
                collectors["control_flow"].append(cf_info)

        # Import detection
        elif node_type in (
            "import_statement", "import_declaration", "include_directive",
            "using_directive", "import_from_statement"
        ):
            import_info = self._extract_import_info(node)
            if import_info:
                collectors["imports"].append(import_info)

        # Recursively traverse children
        for child in node.children:
            self._traverse_node(child, collectors)

    def _extract_function_info(self, node: Node) -> Optional[dict[str, Any]]:
        """Extract function information from node."""
        name = None
        params = []
        return_type = None

        for child in node.children:
            if child.type in ("identifier", "function_declarator"):
                if child.type == "identifier":
                    name = child.text.decode("utf-8") if child.text else None
                else:
                    # Extract from declarator
                    for sub in child.children:
                        if sub.type == "identifier":
                            name = sub.text.decode("utf-8") if sub.text else None
                        elif sub.type == "parameter_list":
                            params = self._extract_parameters(sub)
            elif child.type == "parameter_list":
                params = self._extract_parameters(child)
            elif child.type in ("type_identifier", "primitive_type", "type_qualifier"):
                return_type = child.text.decode("utf-8") if child.text else return_type

        if name:
            return {
                "name": name,
                "parameters": params,
                "return_type": return_type,
                "line_start": node.start_point[0] + 1,
                "line_end": node.end_point[0] + 1,
            }
        return None

    def _extract_class_info(self, node: Node) -> Optional[dict[str, Any]]:
        """Extract class information from node."""
        name = None
        methods = []
        fields = []

        for child in node.children:
            if child.type == "identifier":
                name = child.text.decode("utf-8") if child.text else None
            elif child.type in ("function_definition", "method_definition"):
                method_info = self._extract_function_info(child)
                if method_info:
                    methods.append(method_info)
            elif child.type == "field_declaration":
                field_info = self._extract_variable_info(child)
                if field_info:
                    fields.append(field_info)

        if name:
            return {
                "name": name,
                "methods": methods,
                "fields": fields,
                "line_start": node.start_point[0] + 1,
                "line_end": node.end_point[0] + 1,
            }
        return None

    def _extract_variable_info(self, node: Node) -> Optional[dict[str, Any]]:
        """Extract variable information from node."""
        name = None
        var_type = None

        for child in node.children:
            if child.type == "identifier":
                name = child.text.decode("utf-8") if child.text else None
            elif child.type in ("type_identifier", "primitive_type"):
                var_type = child.text.decode("utf-8") if child.text else None

        if name:
            return {
                "name": name,
                "type": var_type,
                "line": node.start_point[0] + 1,
            }
        return None

    def _extract_control_flow_info(self, node: Node) -> Optional[dict[str, Any]]:
        """Extract control flow information from node."""
        return {
            "type": node.type,
            "line": node.start_point[0] + 1,
        }

    def _extract_import_info(self, node: Node) -> Optional[dict[str, Any]]:
        """Extract import information from node."""
        module_name = None
        
        for child in node.children:
            if child.type in ("string_literal", "identifier", "scoped_identifier"):
                text = child.text.decode("utf-8") if child.text else ""
                if text:
                    module_name = text.strip('"')
                    break

        return {
            "module": module_name,
            "line": node.start_point[0] + 1,
        } if module_name else None

    def _extract_parameters(self, node: Node) -> list[dict[str, Any]]:
        """Extract parameter list from node."""
        params = []
        for child in node.children:
            if child.type == "parameter_declaration":
                param_info = self._extract_variable_info(child)
                if param_info:
                    params.append(param_info)
        return params

    def _create_error_blueprint(
        self,
        language: str,
        reason: str,
        ast_truncated: bool = False,
        lines: int = 0,
        error_details: Optional[dict] = None,
    ) -> ASTBlueprint:
        """Create an error blueprint when parsing fails.
        
        Args:
            language: Target language
            reason: Failure reason
            ast_truncated: Whether code was truncated
            lines: Line count
            error_details: Additional error info
            
        Returns:
            ASTBlueprint with error metadata
        """
        metadata = ASTMetadata(
            ast_truncated=ast_truncated,
            parser_timeout=reason == "parser_timeout",
            lines_of_code=lines,
        )
        
        return ASTBlueprint(
            language=language,
            metadata=metadata,
            raw_ast={"parse_error": reason, "details": error_details or {}},
        )
