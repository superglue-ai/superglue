#!/bin/bash
set -e

# Publish Python SDK to PyPI
# Usage: ./packages/sdk/scripts/publish-sdk-python.sh [patch|minor|major|x.y.z]
# Example: ./packages/sdk/scripts/publish-sdk-python.sh patch
# Example: ./packages/sdk/scripts/publish-sdk-python.sh 1.0.1

# Add pipx bin to PATH
export PATH="$HOME/.local/bin:$PATH"

VERSION_ARG=${1:-patch}
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
SDK_DIR="$(dirname "$SCRIPT_DIR")"
ROOT_DIR="$(dirname "$(dirname "$SDK_DIR")")"

# Load PYPI_TOKEN from .env
if [ -f "$ROOT_DIR/.env" ]; then
  export PYPI_TOKEN=$(grep '^PYPI_TOKEN=' "$ROOT_DIR/.env" | cut -d '=' -f2-)
fi

if [ -z "$PYPI_TOKEN" ]; then
  echo "❌ PYPI_TOKEN not found. Add it to .env or export it."
  exit 1
fi

# Set twine credentials
export TWINE_USERNAME="__token__"
export TWINE_PASSWORD="$PYPI_TOKEN"

echo "🐍 Publishing superglue-client (Python)..."

cd "$SDK_DIR/python"

# Ensure twine is available
if ! command -v twine &> /dev/null; then
  echo "❌ twine not found. Install with: pipx install twine"
  exit 1
fi

# Ensure build is available (pipx installs as pyproject-build)
if ! command -v pyproject-build &> /dev/null; then
  echo "❌ build not found. Install with: pipx install build"
  exit 1
fi

# Get current version from pyproject.toml
CURRENT_VERSION=$(grep '^version = ' pyproject.toml | sed 's/version = "\(.*\)"/\1/')

# Calculate new version based on bump type or use explicit version
bump_version() {
  local version=$1
  local bump_type=$2
  
  IFS='.' read -r major minor patch <<< "$version"
  
  case $bump_type in
    major)
      echo "$((major + 1)).0.0"
      ;;
    minor)
      echo "$major.$((minor + 1)).0"
      ;;
    patch)
      echo "$major.$minor.$((patch + 1))"
      ;;
    *)
      echo "$bump_type"
      ;;
  esac
}

case $VERSION_ARG in
  patch|minor|major)
    VERSION=$(bump_version "$CURRENT_VERSION" "$VERSION_ARG")
    echo "📝 Bumping version ($VERSION_ARG): $CURRENT_VERSION -> $VERSION"
    ;;
  *)
    VERSION=$VERSION_ARG
    echo "📝 Setting version to $VERSION"
    ;;
esac

# Update version in pyproject.toml
sed -i '' "s/^version = \".*\"/version = \"$VERSION\"/" pyproject.toml

# Update version in package.json if it exists
if [ -f "package.json" ]; then
  sed -i '' "s/\"version\": \".*\"/\"version\": \"$VERSION\"/" package.json
fi

# Build
echo "🔨 Building Python package..."
rm -rf dist/
pyproject-build

# Publish to PyPI
echo "🚀 Publishing to PyPI..."
twine upload dist/*

# Stage changes
cd "$ROOT_DIR"
git add .

echo "✅ Python SDK v$VERSION published successfully!"
echo "📝 Changes staged. Commit and push manually or via PR."
