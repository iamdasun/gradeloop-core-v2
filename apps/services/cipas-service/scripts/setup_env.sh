#!/bin/bash
# Environment Setup Script for Clone Detection System
# This script sets up the Python environment and installs all required dependencies

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$(dirname "$SCRIPT_DIR")"
VENV_DIR="$PROJECT_DIR/.venv"

echo "=========================================="
echo "Clone Detection System - Environment Setup"
echo "=========================================="
echo ""

# Check Python version
echo "Checking Python version..."
PYTHON_VERSION=$(python3 --version 2>&1 | cut -d' ' -f2)
echo "Python version: $PYTHON_VERSION"

# Create virtual environment if it doesn't exist
if [ ! -d "$VENV_DIR" ]; then
    echo "Creating virtual environment at $VENV_DIR..."
    python3 -m venv "$VENV_DIR"
else
    echo "Virtual environment already exists at $VENV_DIR"
fi

# Activate virtual environment
echo "Activating virtual environment..."
source "$VENV_DIR/bin/activate"

# Upgrade pip
echo "Upgrading pip..."
pip install --upgrade pip

# Install dependencies using Poetry (preferred) or pip
if command -v poetry &> /dev/null; then
    echo ""
    echo "Installing dependencies with Poetry..."
    cd "$PROJECT_DIR" && poetry install
    echo ""
    echo "✓ Poetry installation complete!"
else
    echo ""
    echo "Poetry not found. Installing dependencies with pip..."
    cd "$PROJECT_DIR" && pip install -e .
    echo ""
    echo "✓ Pip installation complete!"
fi

# Build Tree-sitter parsers
echo ""
echo "Building Tree-sitter parsers..."
python3 "$SCRIPT_DIR/build_parsers.py"

echo ""
echo "=========================================="
echo "Environment setup completed successfully!"
echo "=========================================="
echo ""
echo "To activate the virtual environment, run:"
echo "  source $VENV_DIR/bin/activate"
echo ""
echo "To run the clone detection pipeline:"
echo "  python scripts/run_pipeline.py --all"
echo ""
