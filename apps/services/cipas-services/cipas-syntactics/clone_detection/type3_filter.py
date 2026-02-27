"""
type3_filter.py — Type-3 Clone Classification Layer.

Pipeline role:
  This module is the SECOND stage of the two-stage clone detection pipeline.

  Stage 1: XGBoost Clone Detector (clone_detector_xgb.pkl)
           Trained on Type-1 + Type-2 + Type-3 vs NonClone.
           Outputs a clone probability in [0, 1].

  Stage 2: Type-3 Filter (this module)
           Takes the clone probability + raw feature values and decides
           whether the pair is a *Type-3 near-miss clone* specifically.

           Exclusion rules:
             - Probability < 0.35 → Not even a plausible clone → False
             - Levenshtein ratio  > 0.85 → Almost identical text → Type-1/2, not Type-3
             - AST Jaccard        > 0.90 → Identical structure   → Type-1/2, not Type-3

           Everything that passes through is classified as a Type-3 clone.

Purpose:
  By first training the XGBoost model on the full clone spectrum (Type-1–3)
  we give the model a much richer positive signal during training.  The
  filter then carves out the near-miss boundary: pairs that *are* clones
  but not so similar that they are simply Type-1 or Type-2.

Usage:
    from clone_detection.type3_filter import is_type3_clone

    prob = model.predict_proba(X)[i][1]
    label = is_type3_clone(
        features_array=X[i],
        feature_names=feature_names,
        clone_probability=prob,
    )
"""

from __future__ import annotations

import logging

logger = logging.getLogger(__name__)

# ---------------------------------------------------------------------------
# Boundary constants — these define the Type-3 similarity corridor.
# Values above the upper bounds are too similar to be near-miss (Type-1/2);
# values below the probability floor are not clones at all.
# ---------------------------------------------------------------------------

#: Minimum XGBoost clone probability to even enter the Type-3 corridor.
TYPE3_PROB_FLOOR: float = 0.35

#: Levenshtein ratio UPPER bound.  Pairs more similar than this are
#: Type-1 / Type-2 (text-identical or rename-only) → excluded from Type-3.
TYPE3_LEV_UPPER: float = 0.85

#: AST Jaccard UPPER bound.  Pairs whose AST node-type sets are this similar
#: share an identical structure → excluded from Type-3.
TYPE3_AST_UPPER: float = 0.90


def is_type3_clone(
    features_array,
    feature_names: list[str],
    clone_probability: float,
    *,
    prob_floor: float = TYPE3_PROB_FLOOR,
    lev_upper: float = TYPE3_LEV_UPPER,
    ast_upper: float = TYPE3_AST_UPPER,
) -> bool:
    """
    Classify whether a code pair is a Type-3 (near-miss) clone.

    This function is the second stage in the two-stage pipeline:

        XGBoost Clone Detector → Type-3 Filter → Type-3 prediction

    It uses two structural feature thresholds to decide whether a confirmed
    clone is a *near-miss* or just a Type-1/Type-2 with different labels:

    Rules (short-circuit):
      1. clone_probability < prob_floor  → False  (not a real clone / too uncertain)
      2. levenshtein_ratio > lev_upper   → False  (text too similar → Type-1/2)
      3. ast_jaccard       > ast_upper   → False  (structure too similar → Type-1/2)
      4. Otherwise                       → True   (genuine near-miss → Type-3)

    Args:
        features_array: 1-D numpy array of feature values for the pair.
        feature_names:  List of feature name strings matching ``features_array``.
                        Must include ``"feat_levenshtein_ratio"`` and
                        ``"feat_ast_jaccard"``.
        clone_probability: XGBoost predicted probability that the pair is a
                           clone (output of ``predict_proba(X)[i][1]``).
        prob_floor:  Override the minimum clone probability gate.
        lev_upper:   Override the Levenshtein upper-similarity bound.
        ast_upper:   Override the AST Jaccard upper-similarity bound.

    Returns:
        ``True`` if the pair falls into the Type-3 near-miss corridor,
        ``False`` otherwise.

    Raises:
        ValueError: If ``"feat_levenshtein_ratio"`` or ``"feat_ast_jaccard"``
                    are not present in ``feature_names``.
    """
    # ---- Resolve feature indices -------------------------------------------
    try:
        lev_idx = feature_names.index("feat_levenshtein_ratio")
    except ValueError:
        raise ValueError(
            "'feat_levenshtein_ratio' not found in feature_names. "
            "Ensure the same SyntacticFeatureExtractor config is used in "
            "both training and inference."
        )

    try:
        ast_idx = feature_names.index("feat_ast_jaccard")
    except ValueError:
        raise ValueError(
            "'feat_ast_jaccard' not found in feature_names. "
            "Ensure the same SyntacticFeatureExtractor config is used in "
            "both training and inference."
        )

    levenshtein = float(features_array[lev_idx])
    ast_sim = float(features_array[ast_idx])

    # ---- Boundary checks (order matters — cheapest check first) -----------
    if clone_probability < prob_floor:
        logger.debug(
            "Type-3 filter: REJECT (prob=%.3f < floor=%.2f)",
            clone_probability, prob_floor,
        )
        return False

    if levenshtein > lev_upper:
        logger.debug(
            "Type-3 filter: REJECT (lev=%.3f > %.2f → likely Type-1/2)",
            levenshtein, lev_upper,
        )
        return False

    if ast_sim > ast_upper:
        logger.debug(
            "Type-3 filter: REJECT (ast_jaccard=%.3f > %.2f → likely Type-1/2)",
            ast_sim, ast_upper,
        )
        return False

    logger.debug(
        "Type-3 filter: ACCEPT (prob=%.3f, lev=%.3f, ast=%.3f)",
        clone_probability, levenshtein, ast_sim,
    )
    return True


def is_type3_clone_dict(
    features_dict: dict[str, float],
    clone_probability: float,
    *,
    prob_floor: float = TYPE3_PROB_FLOOR,
    lev_upper: float = TYPE3_LEV_UPPER,
    ast_upper: float = TYPE3_AST_UPPER,
) -> bool:
    """
    Convenience overload that accepts a feature *dictionary* rather than an
    array + name list.  Useful in inference/API routes where features are
    already serialised as dicts.

    Args:
        features_dict:     Dict mapping feature name → value.
        clone_probability: XGBoost clone probability.
        prob_floor:        Minimum clone probability gate.
        lev_upper:         Levenshtein upper bound.
        ast_upper:         AST Jaccard upper bound.

    Returns:
        ``True`` if the pair is a Type-3 near-miss clone.
    """
    levenshtein = float(features_dict.get("feat_levenshtein_ratio", 0.0))
    ast_sim = float(features_dict.get("feat_ast_jaccard", 0.0))

    if clone_probability < prob_floor:
        return False
    if levenshtein > lev_upper:
        return False
    if ast_sim > ast_upper:
        return False
    return True
