# TOMA Dataset

The TOMA dataset is used for evaluating code clone detection systems. It contains categorized code clone pairs across different clone types.

## Dataset Files

| File | Clone Type | Description |
|------|------------|-------------|
| `type1.csv` | Type 1 | Exact clones - identical code fragments with only differences in whitespace, layout, and comments |
| `type2.csv` | Type 2 | Renamed clones - syntactically identical except for changes in identifiers, literals, and types |
| `type3.csv` | Type 3 (Strong) | Strongly similar clones - code fragments with additional statements beyond Type 2 variations |
| `type4.csv` | Type 3 (Moderate) | Moderately similar clones - code fragments with more significant structural differences |
| `type5.csv` | Type 3 (Weak) / Type 4 | Weakly similar clones or semantic clones - functionally equivalent but syntactically different |

## Clone Type Definitions

### Type 1 (Exact Clones)
- Identical code except for whitespace and comments
- Example: Copy-pasted code with reformatted indentation

### Type 2 (Renamed Clones)
- Same structure with renamed identifiers/literals
- Example: Variable name changes, different constant values

### Type 3 (Similar Clones)
- Modified statements added/removed/changed
- Subdivided into:
  - **Strong**: Minor modifications
  - **Moderate**: More significant changes
  - **Weak**: Substantial modifications

### Type 4 (Semantic Clones)
- Different syntax but same functionality
- Example: Different algorithms producing same result

## Usage

Load TOMA dataset files using the `load_toma_csv` utility:

```python
from clone_detection import load_toma_csv

# Load a specific type
type1_pairs = load_toma_csv("type1.csv")
type2_pairs = load_toma_csv("type2.csv")
```
