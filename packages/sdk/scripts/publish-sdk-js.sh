#!/bin/bash
set -e

# Publish TypeScript SDK to npm
# Usage: ./packages/sdk/scripts/publish-sdk-js.sh [patch|minor|major]

VERSION_TYPE=${1:-patch}
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
SDK_DIR="$(dirname "$SCRIPT_DIR")"
ROOT_DIR="$(dirname "$(dirname "$SDK_DIR")")"

echo "📦 Publishing @superglue/client (TypeScript)..."

cd "$SDK_DIR/js"

# Load NPM_TOKEN from .env if not already set
if [ -z "$NPM_TOKEN" ] && [ -f "$ROOT_DIR/.env" ]; then
  NPM_TOKEN=$(grep '^NPM_TOKEN=' "$ROOT_DIR/.env" | cut -d'=' -f2)
fi

if [ -z "$NPM_TOKEN" ]; then
  echo "❌ NPM_TOKEN not found. Set it in .env or export NPM_TOKEN=..."
  exit 1
fi

npm config set //registry.npmjs.org/:_authToken=$NPM_TOKEN

# Generate SDK from OpenAPI spec
echo "🔄 Generating SDK from OpenAPI spec..."
npm run generate

# Build
echo "🔨 Building..."
npm run build

# Bump version (--no-git-tag-version to avoid auto-commit)
echo "📝 Bumping version ($VERSION_TYPE)..."
npm version $VERSION_TYPE --no-git-tag-version

# Publish
echo "🚀 Publishing to npm..."
npm publish --access public

# Stage changes
cd "$ROOT_DIR"
git add .

echo "✅ TypeScript SDK published successfully!"
echo "📝 Changes staged. Commit and push manually or via PR."
