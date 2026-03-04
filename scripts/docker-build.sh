#!/usr/bin/env bash
#
# Helper script to build a service inside Docker.
#
# Purpose:
# - Fix "go: command not found" (or other missing toolchain) by performing the build
#   inside an ephemeral Docker container that has the required toolchain installed.
# - Make builds reproducible and avoid requiring developers to install toolchains locally.
# - Preserve file ownership of produced artifacts (UID/GID).
#
# Usage:
#   ./scripts/docker-build.sh [options] --service <service-path>
#
# Examples:
#   # Build using default golang image and default build command
#   ./scripts/docker-build.sh --service apps/services/academic-service
#
#   # Build with specific Go version and custom output dir
#   ./scripts/docker-build.sh --service apps/services/academic-service \
#     --go-version 1.21 --output build/academic-service
#
#   # Run an arbitrary build command (for non-Go services, provide an image)
#   ./scripts/docker-build.sh --service apps/frontend \
#     --image node:20 --command "npm ci && npm run build" --output build/frontend
#
set -euo pipefail

script_name="$(basename "$0")"

print_help() {
  cat <<EOF
$script_name - Build a service inside Docker

Options:
  -s, --service PATH        (required) Path to the service relative to the repository root or absolute.
  -o, --output PATH         Output path (relative to repository root) where build artifacts are written. Default: bin/<service-name>
  -g, --go-version VER      Go version to use (only used when building with a golang image). Default: 1.21
  -i, --image IMAGE         Docker image to use for the build. Default: golang:\$GO_VERSION (or specified image)
  -c, --command CMD         Build command to run inside the container. Default for Go services: "go build ./cmd/main.go"
  -p, --platform PLATFORM   GOOS/GOARCH (e.g. linux/amd64). If provided sets GOOS/GOARCH envs.
  -h, --help                Show this help and exit.

Notes:
 - The script mounts the repository into /workspace inside the container.
 - Files created by container will be chown'd to the invoking user's UID:GID to preserve ownership.
 - For Go builds, module cache and build cache are mounted to speed up repeated builds:
     - \$HOME/.cache/go-build  -> mounted into container
     - \$HOME/go/pkg/mod       -> mounted into container (module cache)
 - If you build non-Go projects, pass --image and set --command appropriately.

EOF
}

# Default config
GO_VERSION="1.21"
DOCKER_IMAGE=""
BUILD_COMMAND=""
PLATFORM=""
OUTPUT=""
SERVICE_PATH=""

# parse args
if [ $# -eq 0 ]; then
  print_help
  exit 1
fi

while [ "$#" -gt 0 ]; do
  case "$1" in
    -s|--service)
      SERVICE_PATH="$2"; shift 2;;
    -o|--output)
      OUTPUT="$2"; shift 2;;
    -g|--go-version)
      GO_VERSION="$2"; shift 2;;
    -i|--image)
      DOCKER_IMAGE="$2"; shift 2;;
    -c|--command)
      BUILD_COMMAND="$2"; shift 2;;
    -p|--platform)
      PLATFORM="$2"; shift 2;;
    -h|--help)
      print_help; exit 0;;
    --) shift; break;;
    -*)
      echo "Unknown option $1"; print_help; exit 2;;
    *)
      # Positional arg interpreted as service path
      if [ -z "$SERVICE_PATH" ]; then
        SERVICE_PATH="$1"
      else
        echo "Unexpected positional arg: $1"
        print_help; exit 2
      fi
      shift
      ;;
  esac
done

if [ -z "$SERVICE_PATH" ]; then
  echo "Error: --service is required."
  print_help
  exit 2
fi

# Resolve paths
# If SERVICE_PATH is not absolute, assume it's relative to repo root (script's repo root)
repo_root="$(cd "$(dirname "$0")/../.." && pwd -P)"  # scripts/ is at repo_root/scripts
# Allow user to pass absolute or relative paths
if [ "${SERVICE_PATH#/}" = "$SERVICE_PATH" ]; then
  service_abs="$repo_root/$SERVICE_PATH"
else
  service_abs="$SERVICE_PATH"
fi

if [ ! -d "$service_abs" ]; then
  echo "Error: service path does not exist or is not a directory: $service_abs"
  exit 3
fi

service_name="$(basename "$service_abs")"

# Default output location if not provided
if [ -z "$OUTPUT" ]; then
  OUTPUT="bin/$service_name"
fi

output_abs="$repo_root/$OUTPUT"
output_dir="$(dirname "$output_abs")"

# Default docker image if not provided
if [ -z "$DOCKER_IMAGE" ]; then
  DOCKER_IMAGE="golang:${GO_VERSION}"
fi

# Default build command: try to detect Go module
if [ -z "$BUILD_COMMAND" ]; then
  if [ -f "$service_abs/go.mod" ] || grep -q "module " "$service_abs"/go.mod 2>/dev/null || grep -q "module " "$repo_root"/go.mod 2>/dev/null; then
    # prefer building cmd/main.go if exists, otherwise build the package root
    if [ -f "$service_abs/cmd/main.go" ] || [ -d "$service_abs/cmd" ]; then
      BUILD_COMMAND="go build -v -o /workspace/$OUTPUT ./$(realpath --relative-to="$repo_root" "$service_abs")/cmd"
    else
      # If there's a cmd/<service>/main.go or just build package root
      BUILD_COMMAND="go build -v -o /workspace/$OUTPUT ./$(realpath --relative-to="$repo_root" "$service_abs")"
    fi
  else
    # Generic default - user must override for non-go services
    BUILD_COMMAND="echo 'No default build command - please provide --command' && false"
  fi
fi

# Set platform envs if provided
GOOS=""
GOARCH=""
if [ -n "$PLATFORM" ]; then
  # Expect format os/arch
  if [[ "$PLATFORM" == */* ]]; then
    GOOS="${PLATFORM%%/*}"
    GOARCH="${PLATFORM##*/}"
  else
    echo "Invalid --platform value. Expect format GOOS/GOARCH (eg linux/arm64)."
    exit 2
  fi
fi

# sanity checks
if ! command -v docker >/dev/null 2>&1; then
  echo "Error: docker is not available on PATH. Install Docker and ensure it's running."
  exit 4
fi

# Prepare caches to mount (speeds up Go builds)
GO_BUILD_CACHE="${HOME}/.cache/go-build"
GOMODCACHE="${HOME}/go/pkg/mod"
mkdir -p "$GO_BUILD_CACHE" "$GOMODCACHE" "$output_dir"

# Expose UID/GID to the container so files are owned by the caller
UID_VAL="$(id -u)"
GID_VAL="$(id -g)"

# Build the docker run command
docker_args=(
  run --rm
  -u "${UID_VAL}:${GID_VAL}"
  -v "$repo_root":/workspace
  -v "$GO_BUILD_CACHE":/go_build_cache
  -v "$GOMODCACHE":/go/pkg/mod
  -w "/workspace/$(realpath --relative-to="$repo_root" "$service_abs")"
  -e "HOME=/workspace"            # Home inside container set to workspace for caches that use HOME
  -e "GOCACHE=/go_build_cache"    # ensure go build cache uses mounted cache
  -e "GOMODCACHE=/go/pkg/mod"
  --env "CI=true"
  --platform "linux"
)

# If building for specific platform arch (cross-build), still run linux container but set envs
if [ -n "$GOOS" ]; then
  docker_args+=( -e "GOOS=${GOOS}" )
fi
if [ -n "$GOARCH" ]; then
  docker_args+=( -e "GOARCH=${GOARCH}" )
fi

# Final image and command
docker_image="$DOCKER_IMAGE"

# The command we run inside container should write output to /workspace/<OUTPUT>
# BUILD_COMMAND may already reference /workspace/$OUTPUT; ensure it runs from service dir
# Wrap the provided command in a shell to preserve envs and exit code
container_cmd="sh -lc 'set -euo pipefail; echo \"Building in container image: ${docker_image}\"; echo \"Working dir: \$(pwd)\"; ${BUILD_COMMAND}'"

# Print summary
cat <<EOF
--- docker-build summary ---
repo_root: $repo_root
service:   $service_abs
service_name: $service_name
docker_image: $docker_image
build_command: $BUILD_COMMAND
output: $output_abs
uid:gid: ${UID_VAL}:${GID_VAL}
platform env: GOOS=${GOOS:-""} GOARCH=${GOARCH:-""}
----------------------------
EOF

# Run the build
set +e
docker "${docker_args[@]}" "$docker_image" sh -lc "set -euo pipefail; echo 'Using WORKDIR: ' \$(pwd); ${BUILD_COMMAND}"
exit_code=$?
set -e

if [ $exit_code -ne 0 ]; then
  echo "Build failed inside Docker (exit code $exit_code)."
  exit $exit_code
fi

# Ensure ownership and permissions
if [ -e "$output_abs" ]; then
  chown "${UID_VAL}:${GID_VAL}" "$output_abs" || true
  chmod +x "$output_abs" || true
fi

echo "Build completed successfully. Artifact(s) at: $output_abs"
exit 0
