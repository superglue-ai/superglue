#!/bin/bash
set -e

# Generate all SDKs from OpenAPI spec
#
# Usage:
#   ./packages/sdk/scripts/generate-sdks.sh [ts|python|all]

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
SDK_DIR="$(dirname "$SCRIPT_DIR")"
ROOT_DIR="$(dirname "$(dirname "$SDK_DIR")")"

generate_typescript() {
    echo "📦 Generating TypeScript SDK..."
    cd "$SDK_DIR/js"
    npm run generate
    echo "✅ TypeScript SDK generated"
}

generate_python() {
    echo "🐍 Generating Python SDK..."
    "$SCRIPT_DIR/generate-python-sdk.sh"
    echo "✅ Python SDK generated"
}

case "${1:-all}" in
    ts|typescript)
        generate_typescript
        ;;
    py|python)
        generate_python
        ;;
    all)
        generate_typescript
        echo ""
        generate_python
        ;;
    *)
        echo "Usage: $0 [ts|python|all]"
        exit 1
        ;;
esac

echo ""
echo "🎉 SDK generation complete!"
