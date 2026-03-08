"""
Hard Negative Mining for Semantic Clone Detection.

This module implements hard negative mining strategies to improve the
discriminative power of the semantic clone detector.

Hard negatives are non-clone pairs that are difficult to distinguish from clones:
1. Semantic Siblings: Same library/API usage but different logic
2. Structural Twins: Similar nesting/structure but different semantics
3. CodeNet Class Neighbors: Solutions to similar (but different) problems

Why Hard Negatives Matter:
- Easy negatives (e.g., Sort vs DatabaseConnector) teach trivial distinctions
- Hard negatives teach the model to focus on semantic equivalence
- Reduces false positives by 30-50% in practice
"""

import json
import random
from collections import defaultdict
from pathlib import Path
from typing import List, Optional, Tuple

import numpy as np
from tqdm import tqdm

from clone_detection.features.sheneamer_features import SheneamerFeatureExtractor
from clone_detection.utils.common_setup import setup_logging

logger = setup_logging(__name__)


class HardNegativeMiner:
    """
    Mine hard negative training pairs for semantic clone detection.

    Strategies:
    1. Semantic Siblings: Same API calls, different functionality
    2. Structural Twins: Similar CST structure, different semantics
    3. Problem Neighbors: Solutions to adjacent problems in problem sets
    """

    def __init__(
        self,
        feature_extractor: Optional[SheneamerFeatureExtractor] = None,
        similarity_threshold: float = 0.3,
    ):
        """
        Initialize hard negative miner.

        Args:
            feature_extractor: Feature extractor for similarity computation
            similarity_threshold: Minimum similarity for hard negative candidates
        """
        self.feature_extractor = feature_extractor or SheneamerFeatureExtractor()
        self.similarity_threshold = similarity_threshold

    def mine_semantic_siblings(
        self,
        code_pool: List[str],
        api_signatures: List[str],
        n_negatives: int,
        language: str = "java",
    ) -> List[Tuple[str, str]]:
        """
        Mine hard negatives from code with similar API usage but different logic.

        Args:
            code_pool: Pool of code snippets
            api_signatures: API signature/hash for each snippet (e.g., sorted API calls)
            n_negatives: Number of hard negatives to mine
            language: Programming language

        Returns:
            List of (code1, code2) hard negative pairs
        """
        logger.info(
            f"Mining {n_negatives} semantic sibling pairs from {len(code_pool)} snippets..."
        )

        # Group code by API signature
        api_groups = defaultdict(list)
        for code, api_sig in zip(code_pool, api_signatures):
            api_groups[api_sig].append(code)

        # Find pairs within same API group (similar API usage)
        hard_negatives = []

        for api_sig, codes in api_groups.items():
            if len(codes) < 2:
                continue

            # Sample pairs from this API group
            n_pairs = min(
                len(codes) * (len(codes) - 1) // 2, n_negatives // len(api_groups) + 1
            )

            for _ in range(n_pairs):
                if len(hard_negatives) >= n_negatives:
                    break

                # Pick two different snippets with same API usage
                idx1, idx2 = random.sample(range(len(codes)), 2)
                code1, code2 = codes[idx1], codes[idx2]

                # Verify they're actually different (not clones)
                if self._are_semantically_different(code1, code2, language):
                    hard_negatives.append((code1, code2))

        logger.info(f"Mined {len(hard_negatives)} semantic sibling pairs")
        return hard_negatives

    def mine_structural_twins(
        self,
        code_pool: List[str],
        n_negatives: int,
        language: str = "java",
    ) -> List[Tuple[str, str]]:
        """
        Mine hard negatives from code with similar structure but different semantics.

        Args:
            code_pool: Pool of code snippets
            n_negatives: Number of hard negatives to mine
            language: Programming language

        Returns:
            List of (code1, code2) hard negative pairs
        """
        logger.info(
            f"Mining {n_negatives} structural twin pairs from {len(code_pool)} snippets..."
        )

        # Extract structural features for all code
        structural_features = []

        for code in tqdm(code_pool, desc="Extracting structural features"):
            try:
                features = self.feature_extractor.extract_features(code, language)
                # Use only CST and depth features for structural similarity
                cst_features = features[
                    self.feature_extractor.n_traditional : self.feature_extractor.n_traditional
                    + self.feature_extractor.n_cst
                ]
                depth_features = features[
                    self.feature_extractor.n_traditional
                    + self.feature_extractor.n_cst
                    + self.feature_extractor.n_semantic : self.feature_extractor.n_traditional
                    + self.feature_extractor.n_cst
                    + self.feature_extractor.n_semantic
                    + self.feature_extractor.n_depth
                ]
                structural = np.concatenate([cst_features, depth_features])
                structural_features.append(structural)
            except Exception as e:
                logger.warning(f"Feature extraction failed: {e}")
                structural_features.append(np.zeros(55))  # 40 CST + 15 depth

        structural_features = np.array(structural_features)

        # Normalize features
        norms = np.linalg.norm(structural_features, axis=1, keepdims=True)
        norms[norms == 0] = 1
        structural_features_normalized = structural_features / norms

        # Find structurally similar pairs
        hard_negatives = []
        n_samples = len(structural_features)

        # Sample candidate pairs
        max_attempts = n_negatives * 10
        attempts = 0

        while len(hard_negatives) < n_negatives and attempts < max_attempts:
            attempts += 1

            # Pick two random snippets
            idx1, idx2 = random.sample(range(n_samples), 2)

            # Compute structural similarity (cosine)
            feat1 = structural_features_normalized[idx1]
            feat2 = structural_features_normalized[idx2]
            similarity = np.dot(feat1, feat2)

            if similarity >= self.similarity_threshold:
                code1, code2 = code_pool[idx1], code_pool[idx2]

                # Verify they're semantically different
                if self._are_semantically_different(code1, code2, language):
                    hard_negatives.append((code1, code2))

        logger.info(
            f"Mined {len(hard_negatives)} structural twin pairs after {attempts} attempts"
        )
        return hard_negatives

    def mine_problem_neighbors(
        self,
        codenet_path: str,
        problem_groups: dict,
        n_negatives: int,
        language: str = "java",
    ) -> List[Tuple[str, str]]:
        """
        Mine hard negatives from solutions to adjacent/similar problems.

        In CodeNet, problems are grouped by difficulty and topic.
        Solutions to neighboring problems often use similar techniques
        but solve different problems (making them hard negatives).

        Args:
            codenet_path: Path to CodeNet dataset
            problem_groups: Dict mapping problem groups to problem IDs
            n_negatives: Number of hard negatives to mine
            language: Programming language

        Returns:
            List of (code1, code2) hard negative pairs
        """
        logger.info(f"Mining {n_negatives} problem neighbor pairs...")

        # Load solutions from neighboring problems
        problem_solutions = {}

        for group_name, problem_ids in problem_groups.items():
            for problem_id in problem_ids:
                solutions = self._load_problem_solutions(
                    codenet_path, problem_id, language
                )
                if solutions:
                    problem_solutions[problem_id] = solutions

        # Sample pairs from adjacent problems (different problem IDs)
        hard_negatives = []
        problem_ids = list(problem_solutions.keys())

        max_attempts = n_negatives * 10
        attempts = 0

        while len(hard_negatives) < n_negatives and attempts < max_attempts:
            attempts += 1

            # Pick two different problems
            if len(problem_ids) < 2:
                break

            prob1, prob2 = random.sample(problem_ids, 2)

            # Pick one solution from each problem
            code1 = random.choice(problem_solutions[prob1])
            code2 = random.choice(problem_solutions[prob2])

            # These are from different problems, so they're non-clones
            # But they might use similar techniques (hard negatives)
            hard_negatives.append((code1, code2))

        logger.info(
            f"Mined {len(hard_negatives)} problem neighbor pairs after {attempts} attempts"
        )
        return hard_negatives

    def mine_from_dataset(
        self,
        dataset_path: str,
        n_negatives: int,
        strategy: str = "all",
        language: str = "java",
    ) -> List[Tuple[str, str]]:
        """
        Mine hard negatives from an existing dataset.

        Args:
            dataset_path: Path to dataset (JSONL or JSON format)
            n_negatives: Number of hard negatives to mine
            strategy: Mining strategy ('semantic_siblings', 'structural_twins', 'all')

        Returns:
            List of (code1, code2) hard negative pairs
        """
        logger.info(f"Loading dataset from {dataset_path}...")

        # Load dataset
        code_pool = []
        api_signatures = []

        path = Path(dataset_path)

        if path.suffix == ".jsonl":
            with open(path, "r", encoding="utf-8") as f:
                for line in f:
                    data = json.loads(line)
                    code1 = data.get("code1", "")
                    code2 = data.get("code2", "")
                    code_pool.extend([code1, code2])

                    # Extract API signature (sorted unique tokens)
                    tokens = sorted(set(code1.lower().split()))
                    api_signatures.append(
                        "_".join(tokens[:20])
                    )  # First 20 tokens as signature
                    api_signatures.append("_".join(tokens[:20]))

        elif path.suffix == ".json":
            with open(path, "r", encoding="utf-8") as f:
                data = json.load(f)
                for item in data:
                    code1 = item.get("code1", "")
                    code2 = item.get("code2", "")
                    code_pool.extend([code1, code2])

                    tokens = sorted(set(code1.lower().split()))
                    api_signatures.append("_".join(tokens[:20]))
                    api_signatures.append("_".join(tokens[:20]))

        logger.info(f"Loaded {len(code_pool)} code snippets")

        # Mine based on strategy
        all_hard_negatives = []

        if strategy in ["semantic_siblings", "all"]:
            siblings = self.mine_semantic_siblings(
                code_pool, api_signatures, n_negatives // 2, language
            )
            all_hard_negatives.extend(siblings)

        if strategy in ["structural_twins", "all"]:
            twins = self.mine_structural_twins(
                code_pool, n_negatives - len(all_hard_negatives), language
            )
            all_hard_negatives.extend(twins)

        logger.info(f"Total hard negatives mined: {len(all_hard_negatives)}")
        return all_hard_negatives

    def _are_semantically_different(
        self, code1: str, code2: str, language: str
    ) -> bool:
        """
        Check if two code snippets are semantically different.

        Simple heuristic: if they have very different token sets or
        very different structure, they're likely different.

        Args:
            code1: First code snippet
            code2: Second code snippet
            language: Programming language

        Returns:
            True if snippets are semantically different
        """
        # Token-based check
        tokens1 = set(code1.lower().split())
        tokens2 = set(code2.lower().split())

        jaccard = len(tokens1 & tokens2) / max(len(tokens1 | tokens2), 1)

        # If very similar tokens, check structure
        if jaccard > 0.8:
            try:
                features1 = self.feature_extractor.extract_features(code1, language)
                features2 = self.feature_extractor.extract_features(code2, language)

                # Cosine similarity
                norm1 = np.linalg.norm(features1)
                norm2 = np.linalg.norm(features2)

                if norm1 > 0 and norm2 > 0:
                    cosine_sim = np.dot(features1, features2) / (norm1 * norm2)
                    # If very similar in feature space, consider them potentially same
                    if cosine_sim > 0.95:
                        return False
            except Exception:
                pass

        return True

    def _load_problem_solutions(
        self, codenet_path: str, problem_id: str, language: str
    ) -> List[str]:
        """
        Load all accepted solutions for a CodeNet problem.

        Args:
            codenet_path: Path to CodeNet dataset
            problem_id: Problem ID (e.g., 'p00001')
            language: Programming language

        Returns:
            List of source code strings
        """
        solutions = []
        problem_path = Path(codenet_path) / "data" / problem_id

        if not problem_path.exists():
            return solutions

        # Find all submissions in problem directory
        for submission_file in problem_path.glob("*.cpp"):
            try:
                with open(submission_file, "r", encoding="utf-8", errors="ignore") as f:
                    code = f.read()
                    if len(code) > 50:  # Filter out very short submissions
                        solutions.append(code)
            except Exception:
                continue

        return solutions

    def create_balanced_dataset(
        self,
        positive_pairs: List[Tuple[str, str]],
        hard_negative_pairs: List[Tuple[str, str]],
        easy_negative_pairs: Optional[List[Tuple[str, str]]] = None,
        clone_ratio: float = 0.5,
    ) -> List[dict]:
        """
        Create a balanced training dataset with hard negatives.

        Args:
            positive_pairs: List of (code1, code2) clone pairs
            hard_negative_pairs: List of (code1, code2) hard negative pairs
            easy_negative_pairs: Optional easy negative pairs
            clone_ratio: Desired ratio of clones in dataset

        Returns:
            List of training examples with 'code1', 'code2', 'label', 'difficulty'
        """
        dataset = []

        # Add positive pairs (clones)
        for code1, code2 in positive_pairs:
            dataset.append(
                {
                    "code1": code1,
                    "code2": code2,
                    "label": 1,
                    "difficulty": "positive",
                }
            )

        # Add hard negatives
        for code1, code2 in hard_negative_pairs:
            dataset.append(
                {
                    "code1": code1,
                    "code2": code2,
                    "label": 0,
                    "difficulty": "hard_negative",
                }
            )

        # Add easy negatives if provided
        if easy_negative_pairs:
            for code1, code2 in easy_negative_pairs:
                dataset.append(
                    {
                        "code1": code1,
                        "code2": code2,
                        "label": 0,
                        "difficulty": "easy_negative",
                    }
                )

        # Shuffle dataset
        random.shuffle(dataset)

        logger.info(
            f"Created balanced dataset: {len(positive_pairs)} clones, "
            f"{len(hard_negative_pairs)} hard negatives"
            + (
                f", {len(easy_negative_pairs)} easy negatives"
                if easy_negative_pairs
                else ""
            )
        )

        return dataset


def mine_hard_negatives(
    dataset_path: str,
    output_path: str,
    n_negatives: int = 1000,
    strategy: str = "all",
    language: str = "java",
):
    """
    Utility function to mine hard negatives and save to file.

    Args:
        dataset_path: Path to source dataset
        output_path: Path to save hard negatives (JSON format)
        n_negatives: Number of hard negatives to mine
        strategy: Mining strategy ('semantic_siblings', 'structural_twins', 'all')
        language: Programming language
    """
    miner = HardNegativeMiner()

    hard_negatives = miner.mine_from_dataset(
        dataset_path, n_negatives, strategy, language
    )

    # Save to file
    output_data = [
        {"code1": code1, "code2": code2, "label": 0, "difficulty": "hard_negative"}
        for code1, code2 in hard_negatives
    ]

    with open(output_path, "w", encoding="utf-8") as f:
        json.dump(output_data, f, indent=2)

    logger.info(f"Saved {len(hard_negatives)} hard negatives to {output_path}")


if __name__ == "__main__":
    import argparse

    parser = argparse.ArgumentParser(description="Mine hard negatives for training")
    parser.add_argument(
        "--dataset",
        type=str,
        required=True,
        help="Path to source dataset",
    )
    parser.add_argument(
        "--output",
        type=str,
        required=True,
        help="Path to save hard negatives",
    )
    parser.add_argument(
        "--n-negatives",
        type=int,
        default=1000,
        help="Number of hard negatives to mine",
    )
    parser.add_argument(
        "--strategy",
        type=str,
        default="all",
        choices=["semantic_siblings", "structural_twins", "all"],
        help="Mining strategy",
    )
    parser.add_argument(
        "--language",
        type=str,
        default="java",
        choices=["java", "python", "c", "csharp"],
        help="Programming language",
    )

    args = parser.parse_args()

    mine_hard_negatives(
        args.dataset,
        args.output,
        args.n_negatives,
        args.strategy,
        args.language,
    )
