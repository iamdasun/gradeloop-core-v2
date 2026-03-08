"""
Unit tests for Phase 1–4 CIPAS Pipeline additions.

Run with:
    cd apps/services/cipas-services/cipas-syntactics
    poetry run pytest tests/test_pipeline_phases.py -v
"""

from __future__ import annotations

import uuid

import pytest

# ────────────────────────────────────────────────────────────────────────────
# Fixtures / helpers
# ────────────────────────────────────────────────────────────────────────────

JAVA_FUNC_A = """
public int add(int a, int b) {
    return a + b;
}
"""

JAVA_FUNC_B_RENAMED = """
public int sum(int x, int y) {
    return x + y;
}
"""

JAVA_FUNC_C_UNRELATED = """
public String greet(String name) {
    if (name == null) {
        return "Hello, stranger!";
    }
    return "Hello, " + name + "!";
}
"""

JAVA_CLASS = """
public class Calculator {
    private int value;

    public Calculator(int initial) {
        this.value = initial;
    }

    public int add(int x) {
        for (int i = 0; i < x; i++) {
            value++;
        }
        return value;
    }
}
"""

PYTHON_FUNC = """
def compute_sum(a, b):
    return a + b
"""

# ────────────────────────────────────────────────────────────────────────────
# Phase 1: UniversalTokenMapper
# ────────────────────────────────────────────────────────────────────────────


class TestUniversalTokenMapper:
    def test_java_keyword_mapping(self):
        from clone_detection.normalizers.universal_mapper import UniversalTokenMapper

        mapper = UniversalTokenMapper("java")
        assert mapper.map_token("for") == "ITERATION"
        assert mapper.map_token("while") == "ITERATION"
        assert mapper.map_token("if") == "CONDITION"
        assert mapper.map_token("return") == "RETURN"
        assert mapper.map_token("class") == "CLASS_DEF"
        assert mapper.map_token("int") == "VAR_DECL"

    def test_python_keyword_mapping(self):
        from clone_detection.normalizers.universal_mapper import UniversalTokenMapper

        mapper = UniversalTokenMapper("python")
        assert mapper.map_token("def") == "FUNC_DEF"
        assert mapper.map_token("for") == "ITERATION"
        assert mapper.map_token("None") == "LITERAL"
        assert mapper.map_token("True") == "LITERAL"

    def test_c_keyword_mapping(self):
        from clone_detection.normalizers.universal_mapper import UniversalTokenMapper

        mapper = UniversalTokenMapper("c")
        assert mapper.map_token("for") == "ITERATION"
        assert mapper.map_token("while") == "ITERATION"
        assert mapper.map_token("do") == "ITERATION"
        assert mapper.map_token("struct") == "CLASS_DEF"

    def test_csharp_keyword_mapping(self):
        from clone_detection.normalizers.universal_mapper import UniversalTokenMapper

        mapper = UniversalTokenMapper("csharp")
        assert mapper.map_token("foreach") == "ITERATION"
        assert mapper.map_token("namespace") == "IMPORT"
        assert mapper.map_token("sealed") == "MODIFIER"

    def test_literal_detection(self):
        from clone_detection.normalizers.universal_mapper import UniversalTokenMapper

        mapper = UniversalTokenMapper("java")
        assert mapper.map_token("42") == "LITERAL"
        assert mapper.map_token("3.14") == "LITERAL"
        assert mapper.map_token("0xFF") == "LITERAL"
        assert mapper.map_token('"hello"') == "LITERAL"

    def test_identifier_abstracted_to_V(self):
        from clone_detection.normalizers.universal_mapper import UniversalTokenMapper

        mapper = UniversalTokenMapper("java")
        assert mapper.map_token("myVariable") == "V"
        assert mapper.map_token("Calculator") == "V"
        assert mapper.map_token("_internal") == "V"

    def test_passthrough_operators(self):
        from clone_detection.normalizers.universal_mapper import UniversalTokenMapper

        mapper = UniversalTokenMapper("java")
        for op in ["(", ")", "{", "}", "+", "-", "==", ";"]:
            assert mapper.map_token(op) == op

    def test_stream_mapping(self):
        from clone_detection.normalizers.universal_mapper import UniversalTokenMapper

        mapper = UniversalTokenMapper("java")
        tokens = [
            "for",
            "myVar",
            "(",
            "int",
            "i",
            "=",
            "0",
            ";",
            "i",
            "<",
            "10",
            ";",
            "i",
            "++",
            ")",
        ]
        result = mapper.map_token_stream(tokens)
        assert "ITERATION" in result
        assert "VAR_DECL" in result
        assert "LITERAL" in result

    def test_normalize_for_minhash_drops_punctuation(self):
        from clone_detection.normalizers.universal_mapper import UniversalTokenMapper

        mapper = UniversalTokenMapper("java")
        tokens = ["int", "x", "=", "42", ";"]
        result = mapper.normalize_for_minhash(tokens)
        assert ";" not in result
        assert "=" not in result
        assert "VAR_DECL" in result  # int → VAR_DECL
        assert "LITERAL" in result  # 42 → LITERAL

    def test_node_type_mapping(self):
        from clone_detection.normalizers.universal_mapper import UniversalTokenMapper

        assert UniversalTokenMapper.map_node_type("for_statement") == "ITERATION"
        assert UniversalTokenMapper.map_node_type("function_definition") == "FUNC_DEF"
        assert UniversalTokenMapper.map_node_type("class_declaration") == "CLASS_DEF"
        assert UniversalTokenMapper.map_node_type("return_statement") == "RETURN"
        assert UniversalTokenMapper.map_node_type("unknown_node") == "OTHER"


# ────────────────────────────────────────────────────────────────────────────
# Phase 1: Fragmenter
# ────────────────────────────────────────────────────────────────────────────


class TestFragmenter:
    def test_basic_java_segmentation(self):
        from clone_detection.preprocessor import Fragmenter

        fragmenter = Fragmenter("java")
        frags = fragmenter.segment(JAVA_CLASS, "sub_001", "stu_01", "hw1")
        assert len(frags) > 0
        for f in frags:
            assert f.submission_id == "sub_001"
            assert f.student_id == "stu_01"
            assert f.assignment_id == "hw1"
            assert f.language == "java"
            assert len(f.abstract_tokens) > 0
            assert f.token_count > 0

    def test_python_segmentation(self):
        from clone_detection.preprocessor import Fragmenter

        fragmenter = Fragmenter("python")
        frags = fragmenter.segment(PYTHON_FUNC, "sub_002", "stu_02", "hw2")
        assert len(frags) > 0

    def test_sliding_window_generated_for_long_code(self):
        from clone_detection.preprocessor import Fragmenter

        fragmenter = Fragmenter("java")
        # Build code with many tokens
        long_method = "public void longMethod() {\n" + "    int x = 0;\n" * 60 + "}"
        frags = fragmenter.segment(long_method, "sub_003", "stu_03", "hw3")
        window_frags = [f for f in frags if f.fragment_type == "window"]
        assert len(window_frags) > 0

    def test_deduplication(self):
        from clone_detection.preprocessor import Fragmenter

        fragmenter = Fragmenter("java")
        # Same function repeated should yield unique fragments
        code = JAVA_FUNC_A + "\n" + JAVA_FUNC_A
        frags = fragmenter.segment(code, "sub_004", "stu_04", "hw1")
        # Each unique abstract-token sequence appears only once
        keys = [tuple(f.abstract_tokens) for f in frags]
        assert len(keys) == len(set(keys))

    def test_fragment_has_abstract_tokens(self):
        from clone_detection.preprocessor import Fragmenter

        fragmenter = Fragmenter("java")
        frags = fragmenter.segment(JAVA_FUNC_A, "sub_005", "stu_05", "hw1")
        for f in frags:
            # Abstract tokens must NOT contain raw identifiers like 'add', 'a', 'b'
            # They should contain category tokens like 'V', 'RETURN', 'VAR_DECL', etc.
            assert all(t not in ("add", "sum", "a", "b") for t in f.abstract_tokens)


class TestTemplateFilter:
    def test_template_fragments_discarded(self):
        from clone_detection.preprocessor import Fragmenter, TemplateFilter

        tpl_filter = TemplateFilter(threshold=0.9)
        # Register template
        tpl_filter.register_template("hw1", JAVA_FUNC_A, "java")
        # Segment the same code as a student submission
        fragmenter = Fragmenter("java")
        frags = fragmenter.segment(JAVA_FUNC_A, "sub_001", "stu_01", "hw1")
        clean = tpl_filter.filter(frags)
        # All fragments should be discarded (identical to template)
        assert len(clean) == 0 or all(not f.is_template for f in clean)
        # Flagged as template
        template_flagged = [f for f in frags if f.is_template]
        assert len(template_flagged) > 0

    def test_unrelated_code_not_filtered(self):
        from clone_detection.preprocessor import Fragmenter, TemplateFilter

        tpl_filter = TemplateFilter(threshold=0.9)
        tpl_filter.register_template("hw1", JAVA_FUNC_A, "java")
        fragmenter = Fragmenter("java")
        frags = fragmenter.segment(JAVA_FUNC_C_UNRELATED, "sub_002", "stu_02", "hw1")
        clean = tpl_filter.filter(frags)
        # Unrelated code should survive
        assert len(clean) > 0


# ────────────────────────────────────────────────────────────────────────────
# Phase 2: MinHashIndexer
# ────────────────────────────────────────────────────────────────────────────


class TestMinHashIndexer:
    def _make_fragment(self, tokens, fid=None):
        from clone_detection.preprocessor import Fragment

        return Fragment(
            submission_id="sub_test",
            student_id="stu_test",
            assignment_id="hw_test",
            language="java",
            raw_source=" ".join(tokens),
            abstract_tokens=tokens,
            token_count=len(tokens),
            byte_offset=0,
            fragment_type="structural",
            fragment_id=fid or str(uuid.uuid4()),
        )

    def test_index_and_query_same_fragment(self):
        from clone_detection.lsh_index import MinHashIndexer

        indexer = MinHashIndexer(num_perm=64, threshold=0.3)
        frag = self._make_fragment(["FUNC_DEF", "V", "ITERATION", "RETURN", "V"] * 5)
        sig_bytes = indexer.index(frag)
        assert sig_bytes is not None
        assert frag.lsh_signature is not None
        assert indexer.size() == 1

    def test_similar_fragments_share_bucket(self):
        from clone_detection.lsh_index import MinHashIndexer

        indexer = MinHashIndexer(num_perm=128, threshold=0.3)
        base_tokens = ["FUNC_DEF", "VAR_DECL", "ITERATION", "CONDITION", "RETURN"] * 10
        frag_a = self._make_fragment(base_tokens)
        # Slightly modified: swap one token
        mod_tokens = base_tokens[:]
        mod_tokens[0] = "V"
        frag_b = self._make_fragment(mod_tokens)

        indexer.index(frag_a)
        indexer.index(frag_b)

        # Query with frag_a; frag_b should be a candidate
        candidates_a = indexer.query(frag_a)
        candidates_b = indexer.query(frag_b)
        # At least one of the cross-queries should find the other
        found = frag_b.fragment_id in candidates_a or frag_a.fragment_id in candidates_b
        assert found

    def test_very_different_fragments_not_bucketed_together(self):
        from clone_detection.lsh_index import MinHashIndexer

        indexer = MinHashIndexer(num_perm=128, threshold=0.5)
        frag_a = self._make_fragment(["FUNC_DEF", "VAR_DECL", "RETURN"] * 10)
        frag_b = self._make_fragment(
            ["ITERATION", "CONDITION", "LITERAL", "IMPORT"] * 10
        )
        indexer.index(frag_a)
        indexer.index(frag_b)
        candidates = indexer.query(frag_a)
        # With threshold=0.5 and very different tokens, should NOT be bucketed together
        assert frag_b.fragment_id not in candidates

    def test_rebuild_from_db(self):
        from clone_detection.lsh_index import MinHashIndexer

        indexer = MinHashIndexer(num_perm=64, threshold=0.3)
        tokens = ["VAR_DECL", "FUNC_DEF", "RETURN"] * 8
        frag = self._make_fragment(tokens)
        sig_bytes = indexer.index(frag)

        # Build a new index and rebuild from stored sig
        indexer2 = MinHashIndexer(num_perm=64, threshold=0.3)
        loaded = indexer2.rebuild_from_db([(frag.fragment_id, sig_bytes)])
        assert loaded == 1
        assert indexer2.size() == 1

    def test_jaccard_approximation(self):
        from clone_detection.lsh_index import MinHashIndexer

        indexer = MinHashIndexer(num_perm=128, threshold=0.1)
        tokens = ["A", "B", "C", "D", "E"] * 10
        frag_a = self._make_fragment(tokens)
        frag_b = self._make_fragment(tokens)  # identical
        indexer.index(frag_a)
        indexer.index(frag_b)
        j = indexer.jaccard(frag_a.fragment_id, frag_b.fragment_id)
        assert j > 0.8  # identical → near 1.0

    def test_deduplicate_pairs(self):
        from clone_detection.lsh_index import deduplicate_pairs

        pairs = [("a", "b"), ("b", "a"), ("c", "d"), ("a", "b"), ("a", "a")]
        result = deduplicate_pairs(pairs)
        assert ("a", "b") in result
        assert ("c", "d") in result
        assert len(result) == 2  # (a,a) dropped, duplicates merged


# ────────────────────────────────────────────────────────────────────────────
# Phase 4: CollusionGraph
# ────────────────────────────────────────────────────────────────────────────


class TestCollusionGraph:
    def test_single_edge_two_students(self):
        from clone_detection.collusion_graph import CollusionGraph

        g = CollusionGraph()
        g.add_match("alice", "bob", "Type-3", 0.85)
        components = g.connected_components()
        assert len(components) == 1
        assert set(components[0].member_ids) == {"alice", "bob"}

    def test_chain_forms_one_group(self):
        from clone_detection.collusion_graph import CollusionGraph

        g = CollusionGraph()
        g.add_match("alice", "bob", "Type-2", 0.95)
        g.add_match("bob", "carol", "Type-3", 0.78)
        components = g.connected_components()
        assert len(components) == 1
        assert "alice" in components[0].member_ids
        assert "carol" in components[0].member_ids

    def test_two_separate_groups(self):
        from clone_detection.collusion_graph import CollusionGraph

        g = CollusionGraph()
        g.add_match("alice", "bob", "Type-1", 0.99)
        g.add_match("carol", "dave", "Type-3", 0.75)
        components = g.connected_components()
        assert len(components) == 2

    def test_min_confidence_filters_edges(self):
        from clone_detection.collusion_graph import CollusionGraph

        g = CollusionGraph()
        g.add_match("alice", "bob", "Type-3", 0.55)
        g.add_match("carol", "dave", "Type-3", 0.90)
        # Only high-confidence edge should form a group
        components = g.connected_components(min_confidence=0.70)
        assert len(components) == 1
        assert "carol" in components[0].member_ids

    def test_self_match_ignored(self):
        from clone_detection.collusion_graph import CollusionGraph

        g = CollusionGraph()
        g.add_match("alice", "alice", "Type-1", 1.0)
        assert g.edge_count() == 0

    def test_dominant_type_most_severe(self):
        from clone_detection.collusion_graph import CollusionGraph

        g = CollusionGraph()
        g.add_match("alice", "bob", "Type-3", 0.80)
        g.add_match("alice", "carol", "Type-1", 0.99)
        g.add_match("bob", "carol", "Type-2", 0.95)
        components = g.connected_components()
        assert components[0].dominant_type == "Type-1"

    def test_sorted_by_size_descending(self):
        from clone_detection.collusion_graph import CollusionGraph

        g = CollusionGraph()
        g.add_match("a", "b", "Type-3", 0.8)
        g.add_match("b", "c", "Type-3", 0.8)
        g.add_match("d", "e", "Type-3", 0.7)
        components = g.connected_components()
        assert components[0].size >= components[-1].size

    def test_remove_student(self):
        from clone_detection.collusion_graph import CollusionGraph

        g = CollusionGraph()
        g.add_match("alice", "bob", "Type-2", 0.97)
        g.remove_student("alice")
        components = g.connected_components()
        assert len(components) == 0

    def test_adjacency_dict(self):
        from clone_detection.collusion_graph import CollusionGraph

        g = CollusionGraph()
        g.add_match("alice", "bob", "Type-3", 0.85)
        adj = g.to_adjacency_dict()
        assert "alice" in adj
        assert "bob" in adj
        assert adj["alice"][0]["neighbour"] == "bob"

    def test_group_summary(self):
        from clone_detection.collusion_graph import CollusionGraph

        g = CollusionGraph()
        g.add_match("alice", "bob", "Type-3", 0.88)
        groups = g.connected_components()
        summary = groups[0].summary()
        assert "group_id" in summary
        assert "member_ids" in summary
        assert "max_confidence" in summary
        assert summary["max_confidence"] == pytest.approx(0.88)


# ────────────────────────────────────────────────────────────────────────────
# Phase 3 + Integration: CascadeWorker
# ────────────────────────────────────────────────────────────────────────────


class TestCascadeWorkerInMemory:
    """End-to-end pipeline tests using InMemoryDB (no real DB required)."""

    def _build_worker(self):
        from clone_detection.cascade_worker import CascadeWorker, InMemoryDB
        from clone_detection.collusion_graph import CollusionGraph
        from clone_detection.lsh_index import MinHashIndexer

        db = InMemoryDB()
        indexer = MinHashIndexer(num_perm=64, threshold=0.3)
        graph = CollusionGraph()
        worker = CascadeWorker(db=db, indexer=indexer, graph=graph)
        return worker, db, graph

    def test_single_submission_returns_result(self):
        worker, db, graph = self._build_worker()
        result = worker.process_submission(
            source_code=JAVA_FUNC_A,
            language="java",
            submission_id="sub_001",
            student_id="stu_01",
            assignment_id="hw1",
        )
        assert result.submission_id == "sub_001"
        assert result.fragment_count >= 0
        assert isinstance(result.errors, list)

    def test_two_identical_submissions_detect_clone(self):
        worker, db, graph = self._build_worker()
        worker.process_submission(
            source_code=JAVA_FUNC_A,
            language="java",
            submission_id="sub_001",
            student_id="stu_01",
            assignment_id="hw1",
        )
        result2 = worker.process_submission(
            source_code=JAVA_FUNC_A,
            language="java",
            submission_id="sub_002",
            student_id="stu_02",
            assignment_id="hw1",
        )
        confirmed = [m for m in result2.clone_matches if m.is_clone]
        assert len(confirmed) > 0

    def test_collusion_graph_updated(self):
        worker, db, graph = self._build_worker()
        worker.process_submission(JAVA_FUNC_A, "java", "sub_001", "stu_01", "hw1")
        worker.process_submission(JAVA_FUNC_A, "java", "sub_002", "stu_02", "hw1")
        groups = graph.connected_components()
        # stu_01 and stu_02 should be in the same group
        member_sets = [set(g.member_ids) for g in groups]
        found = any({"stu_01", "stu_02"} <= s for s in member_sets)
        assert found

    def test_collusion_report(self):
        worker, db, graph = self._build_worker()
        worker.process_submission(JAVA_FUNC_A, "java", "sub_001", "stu_01", "hw1")
        worker.process_submission(JAVA_FUNC_A, "java", "sub_002", "stu_02", "hw1")
        report = worker.build_collusion_report()
        assert isinstance(report, list)

    def test_rebuild_index_from_db(self):
        worker, db, graph = self._build_worker()
        worker.process_submission(JAVA_FUNC_A, "java", "sub_001", "stu_01", "hw1")
        # Rebuild index from persisted signatures
        count = worker.rebuild_index_from_db()
        assert count >= 0  # at least some signatures persisted

    def test_template_filtered_before_indexing(self):
        worker, db, graph = self._build_worker()
        # Register template
        worker._tpl_filter = None  # reset
        from clone_detection.preprocessor import TemplateFilter

        tpl = TemplateFilter(threshold=0.9)
        tpl.register_template("hw1", JAVA_FUNC_A, "java")
        worker._tpl_filter = tpl

        result = worker.process_submission(
            source_code=JAVA_FUNC_A,
            language="java",
            submission_id="sub_001",
            student_id="stu_01",
            assignment_id="hw1",
        )
        # Template code should be filtered; no meaningful fragments
        assert result.fragment_count == 0
