#!/bin/bash
set -e

# Generate Python SDK from OpenAPI spec
#
# Usage:
#   ./scripts/generate-python-sdk.sh

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(dirname "$SCRIPT_DIR")"
OPENAPI_SPEC="$PROJECT_ROOT/docs/openapi.yaml"
OUTPUT_DIR="$PROJECT_ROOT/packages/sdk-python"
VENV_DIR="$PROJECT_ROOT/.venv-sdk-gen"

echo "🐍 Generating Python SDK from OpenAPI spec..."
echo "  Input: $OPENAPI_SPEC"
echo "  Output: $OUTPUT_DIR"

# Create/activate virtual environment
if [ ! -d "$VENV_DIR" ]; then
    echo "📦 Creating virtual environment..."
    python3 -m venv "$VENV_DIR"
fi

source "$VENV_DIR/bin/activate"

# Install openapi-python-client if needed
if ! pip show openapi-python-client &> /dev/null; then
    echo "📦 Installing openapi-python-client..."
    pip install --quiet openapi-python-client
fi

# Remove old generated code if exists
if [ -d "$OUTPUT_DIR/superglue_sdk" ]; then
    rm -rf "$OUTPUT_DIR/superglue_sdk"
fi

# Generate the SDK
cd "$PROJECT_ROOT"
openapi-python-client generate \
    --path "$OPENAPI_SPEC" \
    --output-path "$OUTPUT_DIR/superglue_sdk" \
    --config "$PROJECT_ROOT/scripts/python-sdk-config.yaml" \
    --meta poetry

# Copy license
cp "$PROJECT_ROOT/LICENSE" "$OUTPUT_DIR/LICENSE"

# Add SuperglueClient alias for better DX
INIT_FILE="$OUTPUT_DIR/superglue_sdk/superglue_sdk/__init__.py"
if [ -f "$INIT_FILE" ]; then
    # Add alias if not already present
    if ! grep -q "SuperglueClient" "$INIT_FILE"; then
        sed -i '' 's/from .client import AuthenticatedClient, Client/from .client import AuthenticatedClient, Client\n\n# Alias for better DX\nSuperglueClient = AuthenticatedClient/' "$INIT_FILE"
        sed -i '' 's/__all__ = (/__all__ = (\n    "SuperglueClient",/' "$INIT_FILE"
    fi
fi

deactivate

echo "✅ Python SDK generated successfully!"
echo ""
echo "To install locally:"
echo "  cd $OUTPUT_DIR/superglue_sdk"
echo "  pip install -e ."
echo ""
echo "To publish to PyPI:"
echo "  cd $OUTPUT_DIR/superglue_sdk"
echo "  poetry publish --build"

