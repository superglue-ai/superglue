#!/bin/bash
set -e

# Publish Python SDK to PyPI
# Usage: ./scripts/publish-sdk-python.sh [version]
# Example: ./scripts/publish-sdk-python.sh 1.0.1

# Add pipx bin to PATH
export PATH="$HOME/.local/bin:$PATH"

VERSION=${1:-}
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(dirname "$SCRIPT_DIR")"

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

echo "🐍 Publishing superglue-sdk (Python)..."

cd "$ROOT_DIR/packages/sdk-python/superglue_sdk"

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

# Update version if provided
if [ -n "$VERSION" ]; then
  sed -i '' "s/^version = \".*\"/version = \"$VERSION\"/" pyproject.toml
  echo "📝 Set version to $VERSION"
else
  VERSION=$(grep '^version = ' pyproject.toml | sed 's/version = "\(.*\)"/\1/')
  echo "📝 Using existing version: $VERSION"
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

# Commit if there are changes
if ! git diff --cached --quiet; then
  git commit -m "chore: release Python SDK v$VERSION"
fi

# Tag and push
git tag "python-v$VERSION" 2>/dev/null || echo "⚠️  Tag python-v$VERSION already exists"
echo "📤 Pushing to git..."
git push origin main --tags

echo "✅ Python SDK v$VERSION published successfully!"

