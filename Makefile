# Makefile for gradeloop-core-v2
# Builds all services under apps/services using the host Go toolchain when available,
# and falls back to a Dockerized Golang image when `go` is not installed on the host.
#
# Usage:
#   make                -> builds all services
#   make build-all      -> same as above
#   make build SERVICE=my-service  -> builds a single service (directory name under apps/services)
#   make clean          -> removes generated binaries under each service's bin/ directory
#   make help           -> prints this help
#
# The Makefile assumes each service has a build entrypoint at `cmd/main.go`.
# Adjust `GO_BUILD_TARGET` or the per-service commands if your layout differs.

SHELL := /bin/sh
ROOT := $(shell pwd)
GO_IMAGE ?= golang:1.26
GO_BUILD_TARGET ?= ./cmd/main.go
GO_BUILD_ENV := GOTOOLCHAIN=auto
OUT_DIR ?= bin

# Discover service directories under apps/services (takes the immediate children)
SERVICES := $(notdir $(wildcard apps/services/*))

.PHONY: all help build-all build clean $(SERVICES)

all: build-all

help:
	@echo "Makefile targets:"
	@echo "  make            -> build-all (builds every service under apps/services)"
	@echo "  make build-all  -> build all services"
	@echo "  make build SERVICE=<name> -> build single service (directory name in apps/services)"
	@echo "  make clean      -> remove built binaries in each service's $(OUT_DIR)/"
	@echo ""
	@echo "Build behavior:"
	@echo " - If the host has the 'go' command available it will be used."
	@echo " - Otherwise a Dockerized Go environment ($(GO_IMAGE)) will be used as a fallback."
	@echo ""
	@echo "Examples:"
	@echo "  make build SERVICE=academic-service"
	@echo "  make build-all"

# Default entry to build every discovered service
# Builds every discovered service (regardless of language)
build-all: $(SERVICES)
	@echo "All services built."

# New: build only Go services under apps/services
# This target will detect Go services (by presence of go.mod or any .go files within two levels)
# and invoke the per-service `build` target only for those.
.PHONY: build-go-all
build-go-all:
	@echo "Building only Go services under apps/services..."
	@for d in apps/services/*; do \
		if [ -d "$$d" ]; then \
			# consider it a Go service if it has go.mod or any .go files (within two levels) \
			if [ -f "$$d/go.mod" ] || find "$$d" -maxdepth 2 -name '*.go' | grep -q .; then \
				svc=$$(basename "$$d"); \
				echo " -> building Go service: $$svc"; \
				$(MAKE) build SERVICE=$$svc || { echo "Build failed for $$svc"; exit 1; }; \
			else \
				echo " -> skipping non-Go service: $$(basename "$$d")"; \
			fi; \
		fi; \
	done

# Per-service rule: each service directory is a target
# This allows `make academic-service` too.
$(SERVICES):
	@$(MAKE) build SERVICE=$@

# Primary build target: builds a single service specified via SERVICE variable.
# Example: make build SERVICE=academic-service
# Tries building with the host 'go' tool first. If the host build fails (non-zero exit),
# it will fall back to building inside Docker so transient host toolchain issues don't stop CI/dev workflow.
build:
	@if [ -z "$(SERVICE)" ]; then \
		echo "ERROR: SERVICE variable not set. Example: make build SERVICE=academic-service"; \
		exit 1; \
	fi
	@echo "Building service: $(SERVICE)"
	@if [ ! -d "apps/services/$(SERVICE)" ]; then \
		echo "ERROR: service directory 'apps/services/$(SERVICE)' does not exist"; \
		exit 1; \
	fi
	@printf " -> ensuring output directory exists: apps/services/%s/$(OUT_DIR)\n" "$(SERVICE)"
	@mkdir -p "apps/services/$(SERVICE)/$(OUT_DIR)"
	@echo " -> checking for host 'go' tool..."
	@entry_point=$(GO_BUILD_TARGET); \
	if [ ! -f "apps/services/$(SERVICE)/$$entry_point" ]; then \
		echo " -> $(GO_BUILD_TARGET) not found, searching in cmd/..."; \
		found=$$(find "apps/services/$(SERVICE)/cmd" -name "main.go" | head -n 1); \
		if [ -n "$$found" ]; then \
			entry_point="./$${found#apps/services/$(SERVICE)/}"; \
			echo " -> found entry point: $$entry_point"; \
		else \
			echo "ERROR: could not find main.go in apps/services/$(SERVICE)/cmd"; \
			exit 1; \
		fi; \
	fi; \
	if command -v go >/dev/null 2>&1; then \
		echo " -> attempting build with host go"; \
		cd "apps/services/$(SERVICE)" && $(GO_BUILD_ENV) go build -o "$(OUT_DIR)/$(SERVICE)" "$$entry_point"; \
		exit_code=$$?; \
		if [ $$exit_code -ne 0 ]; then \
			echo " -> host 'go' build failed (exit $$exit_code). Falling back to Docker ($(GO_IMAGE))..."; \
			docker pull $(GO_IMAGE) >/dev/null || true; \
			docker run --rm -v "$(ROOT)":/work -w /work/apps/services/$(SERVICE) $(GO_IMAGE) sh -c 'mkdir -p "$(OUT_DIR)" && $(GO_BUILD_ENV) go build -o "$(OUT_DIR)/$(SERVICE)" "'"$$entry_point"'"'; \
			exit_code=$$?; \
		fi; \
	else \
		echo " -> host 'go' not found, building inside Docker ($(GO_IMAGE))"; \
		docker pull $(GO_IMAGE) >/dev/null || true; \
		docker run --rm -v "$(ROOT)":/work -w /work/apps/services/$(SERVICE) $(GO_IMAGE) sh -c 'mkdir -p "$(OUT_DIR)" && $(GO_BUILD_ENV) go build -o "$(OUT_DIR)/$(SERVICE)" "'"$$entry_point"'"'; \
		exit_code=$$?; \
	fi; \
	if [ $$exit_code -ne 0 ]; then \
		echo "ERROR: build failed for service $(SERVICE) (exit $$exit_code)"; \
		exit $$exit_code; \
	else \
		echo "SUCCESS: built services/$(SERVICE) -> apps/services/$(SERVICE)/$(OUT_DIR)/$(SERVICE)"; \
	fi

# Clean up built binaries
clean:
	@echo "Cleaning binaries under apps/services/*/$(OUT_DIR)/"
	@for d in apps/services/*; do \
		if [ -d $$d/$(OUT_DIR) ]; then \
			echo " - cleaning $$d/$(OUT_DIR)"; \
			rm -rf $$d/$(OUT_DIR); \
		fi \
	done
	@echo "Clean complete."

# Convenience target to show what would be built (dry-run)
.PHONY: list
list:
	@echo "Discovered services under apps/services:"
	@for s in $(SERVICES); do echo " - $$s"; done
	@echo ""
	@echo "To build a service: make build SERVICE=<name>"

# Provide a helpful message if someone tries to invoke `go` from the Makefile directly
# (not strictly necessary, but explicit guidance is useful)
print-go-guidance:
	@echo "If you prefer to build with the host Go toolchain, install Go:"
	@echo "  Debian/Ubuntu: sudo apt install golang-go"
	@echo "  or download from https://go.dev/dl"
	@echo "Alternatively this Makefile will automatically fallback to Docker if 'go' is not present."
