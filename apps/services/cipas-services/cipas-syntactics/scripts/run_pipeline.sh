#!/usr/bin/env bash
#
# run_pipeline.sh — Run train.py then evaluate.py in sequence.
#
# Trains the XGBoost clone detector on the TOMA dataset, then evaluates the
# full two-stage pipeline (NiCAD + XGBoost + Type-3 Filter) on BigCloneBench
# Balanced.  Both steps share the same --output-dir so all JSON metrics and
# visualisation plots land in one place.
#
# Usage:
#   ./scripts/run_pipeline.sh [OPTIONS]
#
# Options:
#   --model-name NAME        Model filename (default: clone_detector_xgb.pkl)
#   --sample-size N          Limit training pairs (proportionally sampled per CSV)
#   --eval-sample-size N     Limit evaluation pairs per class
#   --threshold T            Override XGBoost decision threshold in evaluate.py
#   --output-dir DIR         Directory for metrics JSON + plots
#                            (default: clone_detection/models/)
#   --train-only             Only run training step
#   --eval-only              Only run evaluation step (model must already exist)
#   --no-node-types          Disable per-node-type AST features (both steps)
#   --use-gpu                Enable GPU acceleration for training
#   --verbose                Enable DEBUG logging for both steps
#   --help / -h              Show this help message
#
# Examples:
#   # Full pipeline with default settings
#   ./scripts/run_pipeline.sh
#
#   # Quick smoke test with small dataset samples
#   ./scripts/run_pipeline.sh --sample-size 5000 --eval-sample-size 500
#
#   # Custom model name, save outputs to a specific directory
#   ./scripts/run_pipeline.sh --model-name my_model.pkl --output-dir /tmp/cipas_run
#
#   # Evaluation only (model already trained), lower threshold for Type-3 recall
#   ./scripts/run_pipeline.sh --eval-only --threshold 0.25
#
#   # Training only with GPU
#   ./scripts/run_pipeline.sh --train-only --use-gpu

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
SERVICE_DIR="$(dirname "$SCRIPT_DIR")"
cd "$SERVICE_DIR"

# ---------------------------------------------------------------------------
# Defaults
# ---------------------------------------------------------------------------
MODEL_NAME="clone_detector_xgb.pkl"
SAMPLE_SIZE=""
EVAL_SAMPLE_SIZE=""
THRESHOLD=""
OUTPUT_DIR=""
TRAIN_ONLY=false
EVAL_ONLY=false
EXTRA_TRAIN_ARGS=()
EXTRA_EVAL_ARGS=()

# ---------------------------------------------------------------------------
# Argument parsing
# ---------------------------------------------------------------------------
while [[ $# -gt 0 ]]; do
    case $1 in
        --model-name)
            MODEL_NAME="$2"; shift 2 ;;
        --sample-size)
            SAMPLE_SIZE="$2"; shift 2 ;;
        --eval-sample-size)
            EVAL_SAMPLE_SIZE="$2"; shift 2 ;;
        --threshold)
            THRESHOLD="$2"; shift 2 ;;
        --output-dir)
            OUTPUT_DIR="$2"; shift 2 ;;
        --train-only)
            TRAIN_ONLY=true; shift ;;
        --eval-only)
            EVAL_ONLY=true; shift ;;
        --no-node-types)
            EXTRA_TRAIN_ARGS+=("--no-node-types")
            EXTRA_EVAL_ARGS+=("--no-node-types")
            shift ;;
        --use-gpu)
            EXTRA_TRAIN_ARGS+=("--use-gpu"); shift ;;
        --verbose)
            EXTRA_TRAIN_ARGS+=("--verbose")
            EXTRA_EVAL_ARGS+=("--verbose")
            shift ;;
        --help|-h)
            grep '^#' "$0" | head -50 | sed 's/^# \{0,1\}//'
            exit 0 ;;
        *)
            echo "Unknown option: $1" >&2
            echo "Use --help for usage information." >&2
            exit 1 ;;
    esac
done

if [[ "$TRAIN_ONLY" == true && "$EVAL_ONLY" == true ]]; then
    echo "Error: --train-only and --eval-only are mutually exclusive." >&2
    exit 1
fi

# ---------------------------------------------------------------------------
# Build argument arrays
# ---------------------------------------------------------------------------
TRAIN_ARGS=(--model-name "$MODEL_NAME")
[[ -n "$SAMPLE_SIZE" ]]  && TRAIN_ARGS+=(--sample-size "$SAMPLE_SIZE")
[[ -n "$OUTPUT_DIR" ]]   && TRAIN_ARGS+=(--output-dir "$OUTPUT_DIR")
TRAIN_ARGS+=("${EXTRA_TRAIN_ARGS[@]+"${EXTRA_TRAIN_ARGS[@]}"}")

EVAL_ARGS=(--model "$MODEL_NAME")
[[ -n "$EVAL_SAMPLE_SIZE" ]] && EVAL_ARGS+=(--sample-size "$EVAL_SAMPLE_SIZE")
[[ -n "$THRESHOLD" ]]         && EVAL_ARGS+=(--threshold "$THRESHOLD")
[[ -n "$OUTPUT_DIR" ]]        && EVAL_ARGS+=(--output-dir "$OUTPUT_DIR")
EVAL_ARGS+=("${EXTRA_EVAL_ARGS[@]+"${EXTRA_EVAL_ARGS[@]}"}")

BORDER="================================================================"

# ---------------------------------------------------------------------------
# Summary
# ---------------------------------------------------------------------------
echo ""
echo "$BORDER"
echo "  CIPAS Syntactics — Training & Evaluation Pipeline"
echo "$BORDER"
echo "  Model       : $MODEL_NAME"
[[ -n "$SAMPLE_SIZE" ]]      && echo "  Train sample: $SAMPLE_SIZE pairs"
[[ -n "$EVAL_SAMPLE_SIZE" ]] && echo "  Eval sample : $EVAL_SAMPLE_SIZE pairs/class"
[[ -n "$THRESHOLD" ]]        && echo "  XGB thresh  : $THRESHOLD"
[[ -n "$OUTPUT_DIR" ]]       && echo "  Output dir  : $OUTPUT_DIR"
[[ "$TRAIN_ONLY" == true ]]  && echo "  Mode        : train-only"
[[ "$EVAL_ONLY"  == true ]]  && echo "  Mode        : eval-only"
echo "$BORDER"

# ---------------------------------------------------------------------------
# Step 1 — Training
# ---------------------------------------------------------------------------
if [[ "$EVAL_ONLY" == false ]]; then
    echo ""
    echo "$BORDER"
    echo "  STEP 1 — Training   (train.py)"
    echo "$BORDER"
    echo ""
    poetry run python train.py "${TRAIN_ARGS[@]}"
    echo ""
    echo "  Training complete."
fi

# ---------------------------------------------------------------------------
# Step 2 — Evaluation
# ---------------------------------------------------------------------------
if [[ "$TRAIN_ONLY" == false ]]; then
    echo ""
    echo "$BORDER"
    echo "  STEP 2 — Evaluation   (evaluate.py)"
    echo "$BORDER"
    echo ""
    poetry run python evaluate.py "${EVAL_ARGS[@]}"
    echo ""
    echo "  Evaluation complete."
fi

# ---------------------------------------------------------------------------
# Done
# ---------------------------------------------------------------------------
OUTPUT_LOCATION="${OUTPUT_DIR:-clone_detection/models}"
echo ""
echo "$BORDER"
echo "  Pipeline Complete!"
echo "$BORDER"
echo ""
echo "  Outputs written to: $OUTPUT_LOCATION"
if [[ "$EVAL_ONLY" == false ]]; then
    echo "    $OUTPUT_LOCATION/training_metrics.json"
fi
if [[ "$TRAIN_ONLY" == false ]]; then
    echo "    $OUTPUT_LOCATION/evaluation_metrics.json"
fi
echo "    $OUTPUT_LOCATION/visualizations/"
echo ""
