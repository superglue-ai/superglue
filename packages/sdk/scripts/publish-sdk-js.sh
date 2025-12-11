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

# Stage changes
git add .

# Commit if there are changes
if ! git diff --cached --quiet; then
  git commit -m "chore: update generated SDK"
fi

# Bump version
echo "📝 Bumping version ($VERSION_TYPE)..."
npm version $VERSION_TYPE

# Publish
echo "🚀 Publishing to npm..."
npm publish --access public

# Push to git
echo "📤 Pushing to git..."
git push origin main --tags

echo "✅ TypeScript SDK published successfully!"
