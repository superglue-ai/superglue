#!/bin/bash
set -e

# Generate Python SDK from OpenAPI spec
#
# Usage:
#   ./packages/sdk/scripts/generate-python-sdk.sh

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
SDK_DIR="$(dirname "$SCRIPT_DIR")"
ROOT_DIR="$(dirname "$(dirname "$SDK_DIR")")"
OPENAPI_SPEC="$ROOT_DIR/docs/openapi.yaml"
OUTPUT_DIR="$SDK_DIR/python/superglue_client"
VENV_DIR="$ROOT_DIR/.venv-sdk-gen"

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

# Backup pyproject.toml and README
PYPROJECT_BACKUP=""
README_BACKUP=""
if [ -f "$OUTPUT_DIR/pyproject.toml" ]; then
    PYPROJECT_BACKUP=$(cat "$OUTPUT_DIR/pyproject.toml")
fi
if [ -f "$OUTPUT_DIR/README.md" ]; then
    README_BACKUP=$(cat "$OUTPUT_DIR/README.md")
fi

# Remove old generated code (keep pyproject.toml and README)
find "$OUTPUT_DIR" -mindepth 1 -maxdepth 1 ! -name 'pyproject.toml' ! -name 'README.md' ! -name 'LICENSE' -exec rm -rf {} +

# Generate the SDK to a temp directory
TEMP_DIR=$(mktemp -d)
cd "$ROOT_DIR"
openapi-python-client generate \
    --path "$OPENAPI_SPEC" \
    --output-path "$TEMP_DIR/superglue_sdk" \
    --config "$SCRIPT_DIR/python-sdk-config.yaml" \
    --meta poetry

# Copy generated source files to output (flatten structure)
cp -r "$TEMP_DIR/superglue_sdk/superglue_sdk/"* "$OUTPUT_DIR/"

# Restore pyproject.toml if we had a backup (preserve our customizations)
if [ -n "$PYPROJECT_BACKUP" ]; then
    echo "$PYPROJECT_BACKUP" > "$OUTPUT_DIR/pyproject.toml"
fi
if [ -n "$README_BACKUP" ]; then
    echo "$README_BACKUP" > "$OUTPUT_DIR/README.md"
fi

# Clean up temp
rm -rf "$TEMP_DIR"

# Add SuperglueClient alias for better DX
INIT_FILE="$OUTPUT_DIR/__init__.py"
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
echo "  cd $OUTPUT_DIR"
echo "  pip install -e ."
echo ""
echo "To publish to PyPI:"
echo "  ./packages/sdk/scripts/publish-sdk-python.sh [version]"
