# Semantic Clone Detection API - Makefile

.PHONY: help install run docker-build docker-run test clean

# Default target
help:
	@echo "Semantic Clone Detection API"
	@echo ""
	@echo "Available targets:"
	@echo "  install       Install Python dependencies"
	@echo "  run           Run the API server"
	@echo "  run-debug     Run the API server in debug mode"
	@echo "  docker-build  Build Docker image"
	@echo "  docker-run    Run Docker container"
	@echo "  docker-gpu    Run Docker container with GPU support"
	@echo "  test          Test the API endpoints"
	@echo "  clean         Clean up temporary files"

# Install dependencies
install:
	pip install -r requirements.txt

# Run the API server
run:
	cd api && uvicorn main:app --host 0.0.0.0 --port 8000

# Run in debug mode
run-debug:
	cd api && uvicorn main:app --host 0.0.0.0 --port 8000 --reload

# Build Docker image
docker-build:
	docker build -t cipas-semantics .

# Run Docker container
docker-run:
	docker run -p 8000:8000 cipas-semantics

# Run Docker container with GPU
docker-gpu:
	docker run --gpus all -p 8000:8000 cipas-semantics

# Test API endpoints
test:
	@echo "Testing health endpoint..."
	@curl -s http://localhost:8000/api/v1/health | jq .
	@echo ""
	@echo "Testing model info endpoint..."
	@curl -s http://localhost:8000/api/v1/model/info | jq .
	@echo ""
	@echo "Testing clone detection..."
	@curl -s -X POST http://localhost:8000/api/v1/detect \
		-H "Content-Type: application/json" \
		-d '{"code1": "def add(a, b): return a + b", "code2": "def sum(a, b): return a + b"}' | jq .
	@echo ""

# Clean up
clean:
	find . -type d -name "__pycache__" -exec rm -rf {} +
	find . -type f -name "*.pyc" -delete
	find . -type f -name "*.pyo" -delete
	find . -type d -name "*.egg-info" -exec rm -rf {} +
	find . -type d -name ".pytest_cache" -exec rm -rf {} +
	find . -type d -name "logs" -exec rm -rf {} +
	@echo "Cleanup complete"
