# Go HTML-to-Markdown Converter

This directory contains a Go-based HTML-to-Markdown converter that provides high-performance HTML parsing and conversion to GitHub Flavored Markdown.

## Overview

The converter is implemented as a C-style shared library (`.so` file) that can be called from Node.js using the `koffi` FFI library. This approach provides:

- **Performance**: Go's efficient HTML parsing and string manipulation
- **GitHub Flavored Markdown**: Uses the `github.com/tomkosm/html-to-markdown` library with GitHub Flavored Markdown plugin
- **Zero-copy**: Direct memory access between Go and Node.js
- **Automatic Fallback**: Graceful fallback to JavaScript-based `node-html-markdown` if Go converter is unavailable

## Files

- `html-to-markdown.go` - Main Go source code
- `go.mod` - Go module definition
- `html-to-markdown.so` - Compiled shared library (generated during Docker build)

## Building

### Docker Build (Recommended)

The Go shared library is automatically built during the Docker image creation process. The main `Dockerfile` includes a multi-stage build that:

1. Uses a Go container to compile the shared library
2. Copies the compiled `.so` file to the final Node.js image

```bash
# Build the Docker image (includes Go library compilation)
docker build -f docker/Dockerfile -t superglue .
```

### Manual Build (Development Only)

For local development, you can manually build the Go library:

```bash
cd packages/core/sharedLibs/go-html-to-md
go mod tidy
go build -o html-to-markdown.so -buildmode=c-shared html-to-markdown.go
```

## Usage

The converter is automatically used in the `HtmlMarkdownStrategy` class and provides automatic fallback to `node-html-markdown` if the Go parser is not available or fails.

```typescript
import { convertHTMLToMarkdown } from './utils/go-html-to-markdown.js';

// Always attempts Go converter first, falls back to node-html-markdown if needed
const markdown = await convertHTMLToMarkdown(htmlContent);
```

## Implementation Details

The converter uses a singleton pattern with lazy loading:

1. **First attempt**: Tries to load and use the Go shared library
2. **Automatic fallback**: If Go library is missing or fails, throws an error that triggers the JavaScript fallback in the calling code
3. **Post-processing**: Applies additional cleanup for multi-line links and skip-to-content removal

## Performance Benefits

- **Faster HTML parsing**: Go's efficient HTML parsing libraries
- **Better memory management**: Reduced garbage collection pressure
- **GitHub Flavored Markdown**: More accurate conversion with proper table, code block, and list formatting
- **Reduced CPU usage**: Especially beneficial for large HTML documents

## Troubleshooting

### "Go shared library not found"

This error occurs when the `html-to-markdown.so` file is missing. In production, ensure you're using the Docker image. For development, manually build the Go library as described above. The system will automatically fall back to the JavaScript converter.

### Platform Compatibility

The shared library is compiled for the target platform during Docker build. For production deployment, the Docker image ensures compatibility.

## Dependencies

- `github.com/tomkosm/html-to-markdown` - Core HTML-to-Markdown conversion
- `github.com/tomkosm/html-to-markdown/plugin` - GitHub Flavored Markdown plugin
- `koffi` - Node.js FFI library for calling the Go function 