#!/usr/bin/env bash
# ============================================================================
# CIPAS Syntactics - Complete Training and Evaluation Pipeline
# ============================================================================
#
# This script automates the complete workflow:
#   1. Train the XGBoost clone detector model
#   2. Evaluate on BigCloneBench Balanced (quick validation)
#   3. Evaluate on full BigCloneBench dataset (comprehensive)
#   4. Generate visualizations and reports
#
# Usage:
#   ./run_train_evaluate.sh [OPTIONS]
#
# Options:
#   --quick           Quick test mode (small sample, fast evaluation)
#   --full            Full evaluation on complete BigCloneBench dataset
#   --workers N       Number of parallel workers (default: 8)
#   --sample-size N   Training sample size (default: 20000)
#   --threshold T     Custom threshold (default: use calibrated)
#   --output-dir DIR  Custom output directory
#   --help            Show this help message
#
# Examples:
#   # Quick test (5-10 minutes)
#   ./run_train_evaluate.sh --quick
#
#   # Standard training and evaluation (30-60 minutes)
#   ./run_train_evaluate.sh --sample-size 20000
#
#   # Full evaluation with parallel processing (2-4 hours)
#   ./run_train_evaluate.sh --full --workers 16
#
# ============================================================================

set -e  # Exit on error

# Default configuration
QUICK_MODE=false
FULL_EVAL=false
WORKERS=8
TRAIN_SAMPLE_SIZE=20000
CUSTOM_THRESHOLD=""
OUTPUT_DIR=""
EVAL_SAMPLE_SIZE=""

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Script directory
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR"

# ============================================================================
# Helper Functions
# ============================================================================

print_header() {
    echo -e "\n${BLUE}============================================================================${NC}"
    echo -e "${BLUE}$1${NC}"
    echo -e "${BLUE}============================================================================${NC}\n"
}

print_success() {
    echo -e "${GREEN}✓ $1${NC}"
}

print_warning() {
    echo -e "${YELLOW}⚠ $1${NC}"
}

print_error() {
    echo -e "${RED}✗ $1${NC}"
}

show_help() {
    head -30 "$0" | tail -25
    exit 0
}

# ============================================================================
# Parse Command Line Arguments
# ============================================================================

while [[ $# -gt 0 ]]; do
    case $1 in
        --quick)
            QUICK_MODE=true
            TRAIN_SAMPLE_SIZE=5000
            EVAL_SAMPLE_SIZE=2000
            WORKERS=4
            shift
            ;;
        --full)
            FULL_EVAL=true
            shift
            ;;
        --workers)
            WORKERS="$2"
            shift 2
            ;;
        --sample-size)
            TRAIN_SAMPLE_SIZE="$2"
            shift 2
            ;;
        --threshold)
            CUSTOM_THRESHOLD="--threshold $2"
            shift 2
            ;;
        --output-dir)
            OUTPUT_DIR="--output-dir $2"
            shift 2
            ;;
        --help)
            show_help
            ;;
        *)
            print_error "Unknown option: $1"
            show_help
            ;;
    esac
done

# ============================================================================
# Pre-flight Checks
# ============================================================================

print_header "CIPAS Syntactics - Training & Evaluation Pipeline"

echo "Configuration:"
echo "  Quick Mode:       $QUICK_MODE"
echo "  Full Evaluation:  $FULL_EVAL"
echo "  Workers:          $WORKERS"
echo "  Train Sample:     $TRAIN_SAMPLE_SIZE"
echo "  Custom Threshold: ${CUSTOM_THRESHOLD:-default}"
echo ""

# Check if dataset exists
if [ ! -d "/home/iamdasun/Projects/4yrg/gradeloop-core-v2/datasets/toma-dataset" ]; then
    print_error "TOMA dataset not found!"
    echo "Please ensure the TOMA dataset is available at:"
    echo "  /home/iamdasun/Projects/4yrg/gradeloop-core-v2/datasets/toma-dataset"
    exit 1
fi
print_success "TOMA dataset found"

if [ ! -f "/home/iamdasun/Projects/4yrg/gradeloop-core-v2/datasets/bigclonebench/bigclonebench_balanced.json" ]; then
    print_error "BigCloneBench Balanced dataset not found!"
    exit 1
fi
print_success "BigCloneBench Balanced dataset found"

if [ ! -f "/home/iamdasun/Projects/4yrg/gradeloop-core-v2/datasets/bigclonebench/bigclonebench.jsonl" ] && [ "$FULL_EVAL" = true ]; then
    print_error "Full BigCloneBench dataset not found!"
    echo "Required for --full evaluation mode."
    exit 1
fi
if [ "$FULL_EVAL" = true ]; then
    print_success "Full BigCloneBench dataset found"
fi

# Check if poetry is available
if ! command -v poetry &> /dev/null; then
    print_error "Poetry is not installed!"
    exit 1
fi
print_success "Poetry is available"

echo ""

# ============================================================================
# Step 1: Training
# ============================================================================

print_header "Step 1: Training XGBoost Clone Detector"

TRAIN_CMD="poetry run python train.py --sample-size $TRAIN_SAMPLE_SIZE --workers $WORKERS"

if [ -n "$OUTPUT_DIR" ]; then
    TRAIN_CMD="$TRAIN_CMD $OUTPUT_DIR"
fi

echo "Running: $TRAIN_CMD"
echo ""

# Run training
eval "$TRAIN_CMD"

# Check if model was created
if [ ! -f "models/clone_detector_xgb.pkl" ]; then
    print_error "Training failed! Model file not created."
    exit 1
fi
print_success "Model trained and saved to models/clone_detector_xgb.pkl"

# Extract threshold from training output (if available)
THRESHOLD_INFO=$(grep -o "Clone detector threshold: [0-9.]*" <<< "$TRAIN_OUTPUT" 2>/dev/null || echo "")
if [ -n "$THRESHOLD_INFO" ]; then
    print_success "Calibrated threshold: $THRESHOLD_INFO"
fi

echo ""

# ============================================================================
# Step 2: Quick Evaluation (BigCloneBench Balanced)
# ============================================================================

print_header "Step 2: Quick Evaluation on BigCloneBench Balanced"

EVAL_CMD="poetry run python evaluate.py --model models/clone_detector_xgb.pkl"

if [ -n "$CUSTOM_THRESHOLD" ]; then
    EVAL_CMD="$EVAL_CMD $CUSTOM_THRESHOLD"
fi

if [ -n "$EVAL_SAMPLE_SIZE" ]; then
    EVAL_CMD="$EVAL_CMD --sample-size $EVAL_SAMPLE_SIZE"
fi

if [ -n "$OUTPUT_DIR" ]; then
    EVAL_CMD="$EVAL_CMD $OUTPUT_DIR"
fi

echo "Running: $EVAL_CMD"
echo ""

# Run evaluation
eval "$EVAL_CMD"

print_success "Quick evaluation complete"

echo ""

# ============================================================================
# Step 3: Full Evaluation (Optional)
# ============================================================================

if [ "$FULL_EVAL" = true ]; then
    print_header "Step 3: Full Evaluation on BigCloneBench (Parallel)"

    FULL_EVAL_CMD="poetry run python evaluate_parallel.py \
        --dataset full \
        --model models/clone_detector_xgb.pkl \
        --workers $WORKERS"

    if [ -n "$CUSTOM_THRESHOLD" ]; then
        FULL_EVAL_CMD="$FULL_EVAL_CMD $CUSTOM_THRESHOLD"
    fi

    if [ -n "$OUTPUT_DIR" ]; then
        FULL_EVAL_CMD="$FULL_EVAL_CMD $OUTPUT_DIR"
    fi

    echo "Running: $FULL_EVAL_CMD"
    echo ""
    echo "⚠ This may take several hours depending on worker count..."
    echo ""

    # Run full evaluation
    eval "$FULL_EVAL_CMD"

    print_success "Full evaluation complete"
else
    print_header "Step 3: Skipped (Full Evaluation)"
    echo "To run full evaluation, use: ./run_train_evaluate.sh --full"
fi

echo ""

# ============================================================================
# Step 4: Generate Summary Report
# ============================================================================

print_header "Step 4: Generating Summary Report"

# Create summary file
SUMMARY_FILE="results/evaluate/training_evaluation_summary_$(date +%Y%m%d_%H%M%S).md"

cat > "$SUMMARY_FILE" << EOF
# CIPAS Syntactics - Training & Evaluation Summary

**Date:** $(date '+%Y-%m-%d %H:%M:%S')

## Configuration

| Parameter | Value |
|-----------|-------|
| Training Sample Size | $TRAIN_SAMPLE_SIZE |
| Workers | $WORKERS |
| Quick Mode | $QUICK_MODE |
| Full Evaluation | $FULL_EVAL |
| Custom Threshold | ${CUSTOM_THRESHOLD:-No} |

## Training Results

- **Model File:** models/clone_detector_xgb.pkl
- **Training Metrics:** results/train/training_metrics.json

## Evaluation Results

### BigCloneBench Balanced

- **Metrics:** results/evaluate/evaluation_metrics.json
- **Visualizations:** results/evaluate/visualizations/

$(if [ "$FULL_EVAL" = true ]; then
echo "### Full BigCloneBench"
echo ""
echo "- **Metrics:** results/evaluate/bcb_parallel_metrics_full_*.json"
fi)

## Key Metrics

### Training (Test Split)

\`\`\`json
$(cat results/train/training_metrics.json 2>/dev/null | python -c "import sys, json; d=json.load(sys.stdin); print(json.dumps(d.get('metrics', {}), indent=2))" 2>/dev/null || echo "Unable to parse training metrics")
\`\`\`

### Evaluation (BigCloneBench Balanced)

\`\`\`json
$(cat results/evaluate/evaluation_metrics.json 2>/dev/null | python -c "import sys, json; d=json.load(sys.stdin); print(json.dumps(d.get('metrics', {}), indent=2))" 2>/dev/null || echo "Unable to parse evaluation metrics")
\`\`\`

## Next Steps

1. Review metrics:
   \`\`\`bash
   cat results/train/training_metrics.json | python -m json.tool
   cat results/evaluate/evaluation_metrics.json | python -m json.tool
   \`\`\`

2. View visualizations:
   \`\`\`bash
   open results/evaluate/visualizations/confusion_matrix_eval.png
   open results/evaluate/visualizations/per_clone_type_recall.png
   \`\`\`

3. Run additional evaluations:
   \`\`\`bash
   # Different threshold
   poetry run python evaluate.py --threshold 0.30

   # Specific clone types
   poetry run python evaluate.py --clone-types 3

   # Full dataset
   poetry run python evaluate_parallel.py --dataset full --workers 16
   \`\`\`

---
*Generated by run_train_evaluate.sh*
EOF

print_success "Summary report saved to: $SUMMARY_FILE"

echo ""

# ============================================================================
# Complete
# ============================================================================

print_header "Pipeline Complete!"

echo "Output Files:"
echo ""
echo "  Models:"
echo "    - models/clone_detector_xgb.pkl"
echo ""
echo "  Training Results:"
echo "    - results/train/training_metrics.json"
echo "    - results/train/visualizations/"
echo ""
echo "  Evaluation Results:"
echo "    - results/evaluate/evaluation_metrics.json"
echo "    - results/evaluate/visualizations/"
if [ "$FULL_EVAL" = true ]; then
    echo "    - results/evaluate/bcb_parallel_metrics_full_*.json"
fi
echo ""
echo "  Summary:"
echo "    - $SUMMARY_FILE"
echo ""

print_success "All done!"

echo ""
echo "To view results:"
echo "  cat $SUMMARY_FILE"
echo "  cat results/train/training_metrics.json | python -m json.tool"
echo "  cat results/evaluate/evaluation_metrics.json | python -m json.tool"
echo ""
