#!/bin/bash
set -e

# Publish SDK to npm
# Usage: ./scripts/publish.sh [patch|minor|major]

VERSION_TYPE=${1:-patch}

echo "📦 Publishing @superglue/client..."

# Ensure we're logged in to npm
npm whoami > /dev/null 2>&1 || { echo "❌ Not logged in to npm. Run 'npm login' first."; exit 1; }

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

echo "✅ Published successfully!"

