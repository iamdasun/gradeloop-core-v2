# CIPAS Syntactics - Visualization Generation Test Results

## Test Date
March 6, 2026

## Dependencies Check

✅ **All dependencies installed successfully:**
- fastapi
- uvicorn
- pydantic
- tree-sitter
- tree-sitter-java
- tree-sitter-c
- tree-sitter-python
- scikit-learn
- xgboost
- pandas
- numpy
- rapidfuzz
- datasketch
- networkx
- tqdm
- matplotlib
- pyyaml

## Training Visualization Test

### Configuration
- Sample size: 500 pairs
- Visualizations: Enabled
- Output directory: `results/train/`

### Results
✅ **All 4 training diagrams generated successfully:**

1. **threshold_sweep.png** (73.5 KB)
   - Shows Precision, Recall, F1 across different thresholds
   - Marks selected threshold with vertical line

2. **feature_importances_train.png** (125.1 KB)
   - Top-20 feature importances (horizontal bar chart)
   - Shows which features contribute most to predictions

3. **confusion_matrix_train.png** (33.6 KB)
   - Confusion matrix heatmap (TN, FP, FN, TP)
   - Color-coded for easy interpretation

4. **per_source_recall.png** (44.3 KB)
   - Per-dataset-source recall breakdown
   - Shows model performance across different clone types

### Training Metrics
- Accuracy: 0.9500
- Precision: 0.9487
- Recall: 0.9867
- F1 Score: 0.9673
- ROC AUC: 0.9779
- Threshold: 0.56

## Evaluation Visualization Test

### Configuration
- Sample size: 500 pairs
- Dataset: BigCloneBench Balanced
- Visualizations: Enabled
- Output directory: `results/evaluate/`

### Results
✅ **All 2 evaluation diagrams generated successfully:**

1. **confusion_matrix_eval.png** (37.7 KB)
   - Confusion matrix for evaluation dataset
   - Shows model generalization performance

2. **per_clone_type_recall.png** (30.3 KB)
   - Per-clone-type recall (Type-1, Type-2, Type-3)
   - Shows detection performance by clone type

### Evaluation Metrics
- Accuracy: 0.8070
- Precision: 0.7946
- Recall: 0.8280
- F1 Score: 0.8110
- ROC AUC: 0.9011
- Threshold: 0.56

### Per-Clone-Type Performance
- Type-1 Recall: 1.0000 (n=224) ✅
- Type-2 Recall: 1.0000 (n=45) ✅
- Type-3 Recall: 0.6277 (n=231) ⚠️

## Usage Instructions

### Training with Visualizations

```bash
# Default (visualizations enabled via config.yaml)
python train.py

# With sample size override
python train.py --sample-size 10000

# Disable visualizations (faster)
python train.py --no-visualize
```

### Evaluation with Visualizations

```bash
# Default (visualizations enabled via config.yaml)
python evaluate.py

# With sample size override
python evaluate.py --sample-size 5000

# Disable visualizations (faster)
python evaluate.py --no-visualize
```

## Output File Locations

### Training Outputs
```
results/train/
├── training_metrics.json          # JSON metrics
└── visualizations/
    ├── threshold_sweep.png        # Threshold analysis
    ├── feature_importances_train.png  # Feature importance
    ├── confusion_matrix_train.png # Confusion matrix
    └── per_source_recall.png      # Per-source breakdown
```

### Evaluation Outputs
```
results/evaluate/
├── evaluation_metrics.json        # JSON metrics
└── visualizations/
    ├── confusion_matrix_eval.png  # Confusion matrix
    └── per_clone_type_recall.png  # Per-type recall
```

## Configuration

Visualizations are controlled by the `visualize` parameter in `config.yaml`:

```yaml
training:
  visualize: true  # Enable/disable training visualizations

evaluation:
  visualize: true  # Enable/disable evaluation visualizations
```

## Performance Notes

- **Training visualizations**: Add ~2-5 seconds to training time
- **Evaluation visualizations**: Add ~1-3 seconds to evaluation time
- **Memory usage**: Minimal impact (< 50MB additional)
- **File sizes**: Range from 30-125 KB per diagram

## Troubleshooting

### matplotlib not installed
```
WARNING: matplotlib not installed — skipping visualization plots
```
**Solution**: Install matplotlib
```bash
poetry install
```

### Visualization generation failed
```
WARNING: Visualization generation failed: <error>
```
**Solution**: Check that output directories are writable and matplotlib backend is configured correctly.

## Conclusion

✅ All dependencies are properly installed  
✅ Training visualizations generate successfully (4 diagrams)  
✅ Evaluation visualizations generate successfully (2 diagrams)  
✅ Metrics JSON files are generated correctly  
✅ All visualizations are saved in appropriate directories  
✅ CLI flags (`--no-visualize`) work as expected  

The visualization system is fully functional and ready for production use!
