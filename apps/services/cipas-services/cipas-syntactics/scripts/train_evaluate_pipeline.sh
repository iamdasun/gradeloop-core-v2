#!/bin/bash
#
# Train on TOMA dataset and Evaluate on BigCloneBench Balanced dataset
#
# Usage:
#   ./scripts/train_evaluate_pipeline.sh [OPTIONS]
#
# Options:
#   --toma-dataset PATH     Path to TOMA dataset directory (required for training)
#   --bcb-dataset PATH      Path to BigCloneBench balanced JSON (required for evaluation)
#   --model-name NAME       Model output filename (default: toma_trained_xgb.pkl)
#   --n-estimators N        Number of trees (default: 100)
#   --max-depth N           Maximum tree depth (default: 6)
#   --learning-rate RATE    Learning rate (default: 0.1)
#   --sample-size N         Sample size for training (optional)
#   --eval-sample-size N    Sample size for evaluation (optional)
#   --clone-types TYPES     Clone types to include (e.g., "1 2 3")
#   --use-gpu               Enable GPU acceleration
#   --train-only            Only run training
#   --eval-only             Only run evaluation
#   --help                  Show this help message
#
# Examples:
#   # Full pipeline: train on TOMA, evaluate on BigCloneBench
#   ./scripts/train_evaluate_pipeline.sh \
#       --toma-dataset /path/to/toma-dataset \
#       --bcb-dataset /path/to/bigclonebench_balanced.json
#
#   # Training only with custom hyperparameters
#   ./scripts/train_evaluate_pipeline.sh \
#       --toma-dataset /path/to/toma-dataset \
#       --n-estimators 200 \
#       --max-depth 8 \
#       --train-only
#
#   # Evaluation only
#   ./scripts/train_evaluate_pipeline.sh \
#       --bcb-dataset /path/to/bigclonebench_balanced.json \
#       --model-name toma_trained_xgb.pkl \
#       --eval-only

set -e

# Default values
TOMA_DATASET=""
BCB_DATASET=""
MODEL_NAME="toma_trained_xgb.pkl"
N_ESTIMATORS=100
MAX_DEPTH=6
LEARNING_RATE=0.1
SUBSAMPLE=0.8
COLSAMPLE_BYTREE=0.8
SAMPLE_SIZE=""
EVAL_SAMPLE_SIZE=""
CLONE_TYPES=""
USE_GPU=""
TRAIN_ONLY=false
EVAL_ONLY=false
VERBOSE=""

# Script directory
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PARENT_DIR="$(dirname "$SCRIPT_DIR")"
cd "$PARENT_DIR"

# Parse arguments
while [[ $# -gt 0 ]]; do
    case $1 in
        --toma-dataset)
            TOMA_DATASET="$2"
            shift 2
            ;;
        --bcb-dataset)
            BCB_DATASET="$2"
            shift 2
            ;;
        --model-name)
            MODEL_NAME="$2"
            shift 2
            ;;
        --n-estimators)
            N_ESTIMATORS="$2"
            shift 2
            ;;
        --max-depth)
            MAX_DEPTH="$2"
            shift 2
            ;;
        --learning-rate)
            LEARNING_RATE="$2"
            shift 2
            ;;
        --subsample)
            SUBSAMPLE="$2"
            shift 2
            ;;
        --colsample-bytree)
            COLSAMPLE_BYTREE="$2"
            shift 2
            ;;
        --sample-size)
            SAMPLE_SIZE="--sample-size $2"
            shift 2
            ;;
        --eval-sample-size)
            EVAL_SAMPLE_SIZE="--sample-size $2"
            shift 2
            ;;
        --clone-types)
            CLONE_TYPES="--clone-types $2"
            shift 2
            ;;
        --use-gpu)
            USE_GPU="--use-gpu"
            shift
            ;;
        --train-only)
            TRAIN_ONLY=true
            shift
            ;;
        --eval-only)
            EVAL_ONLY=true
            shift
            ;;
        --verbose)
            VERBOSE="--verbose"
            shift
            ;;
        --help)
            head -50 "$0" | tail -45
            exit 0
            ;;
        *)
            echo "Unknown option: $1"
            echo "Use --help for usage information"
            exit 1
            ;;
    esac
done

# Validate arguments
if [ "$EVAL_ONLY" = false ] && [ -z "$TOMA_DATASET" ]; then
    echo "Error: --toma-dataset is required for training"
    echo "Use --help for usage information"
    exit 1
fi

if [ "$TRAIN_ONLY" = false ] && [ -z "$BCB_DATASET" ]; then
    echo "Error: --bcb-dataset is required for evaluation"
    echo "Use --help for usage information"
    exit 1
fi

if [ "$EVAL_ONLY" = false ] && [ ! -d "$TOMA_DATASET" ]; then
    echo "Error: TOMA dataset directory not found: $TOMA_DATASET"
    exit 1
fi

if [ "$TRAIN_ONLY" = false ] && [ ! -f "$BCB_DATASET" ]; then
    echo "Error: BigCloneBench dataset file not found: $BCB_DATASET"
    exit 1
fi

MODEL_PATH="$PARENT_DIR/clone_detection/models/$MODEL_NAME"

echo "============================================================"
echo "TOMA Training & BigCloneBench Evaluation Pipeline"
echo "============================================================"
echo ""
echo "Configuration:"
if [ "$EVAL_ONLY" = false ]; then
    echo "  TOMA Dataset:     $TOMA_DATASET"
fi
if [ "$TRAIN_ONLY" = false ]; then
    echo "  BCB Dataset:      $BCB_DATASET"
fi
echo "  Model output:     models/$MODEL_NAME"
echo "  n_estimators:     $N_ESTIMATORS"
echo "  max_depth:        $MAX_DEPTH"
echo "  learning_rate:    $LEARNING_RATE"
[ -n "$SAMPLE_SIZE" ] && echo "  sample_size:      $SAMPLE_SIZE"
[ -n "$EVAL_SAMPLE_SIZE" ] && echo "  eval_sample_size: $EVAL_SAMPLE_SIZE"
[ -n "$CLONE_TYPES" ] && echo "  clone_types:      $CLONE_TYPES"
[ -n "$USE_GPU" ] && echo "  GPU acceleration: Enabled"
echo ""
echo "============================================================"

# Training
if [ "$EVAL_ONLY" = false ]; then
    echo ""
    echo "============================================================"
    echo "STEP 1: Training on TOMA Dataset"
    echo "============================================================"
    echo ""

    poetry run python ./train_toma.py \
        --dataset "$TOMA_DATASET" \
        --model-name "$MODEL_NAME" \
        --n-estimators "$N_ESTIMATORS" \
        --max-depth "$MAX_DEPTH" \
        --learning-rate "$LEARNING_RATE" \
        --subsample "$SUBSAMPLE" \
        --colsample-bytree "$COLSAMPLE_BYTREE" \
        $SAMPLE_SIZE \
        $CLONE_TYPES \
        $USE_GPU \
        $VERBOSE

    # Check if model was created
    if [ ! -f "$MODEL_PATH" ]; then
        echo ""
        echo "Error: Model file was not created: $MODEL_PATH"
        exit 1
    fi
fi

# Evaluation
if [ "$TRAIN_ONLY" = false ]; then
    echo ""
    echo "============================================================"
    echo "STEP 2: Evaluating on BigCloneBench Balanced Dataset"
    echo "============================================================"
    echo ""

    poetry run python ./evaluate_bigclonebench.py \
        --model "$MODEL_PATH" \
        --dataset "$BCB_DATASET" \
        $EVAL_SAMPLE_SIZE \
        --output-json "$PARENT_DIR/clone_detection/models/evaluation_metrics.json" \
        $VERBOSE

    echo ""
    echo "============================================================"
    echo "Pipeline Complete!"
    echo "============================================================"
    echo ""
    echo "Outputs:"
    echo "  Model:      $MODEL_PATH"
    echo "  Metrics:    $PARENT_DIR/clone_detection/models/evaluation_metrics.json"
    echo ""
fi
