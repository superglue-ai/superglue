# File Handling

How the runtime detects, parses, and exposes files across all protocol strategies (HTTP, FTP, SFTP, SMB).

## Detection Priority

Every response is read as raw bytes. The runtime classifies it using this priority chain:

1. **Magic-byte detection** — known binary signatures (ZIP `PK\x03\x04`, PDF `%PDF`, GZIP `\x1f\x8b`, plus internal ZIP structure checks for Excel/DOCX).
2. **`Content-Disposition: attachment`** — `attachment` or `filename=` in this header forces file treatment.
3. **`application/octet-stream`** — explicit octet-stream MIME catches unlabeled binary payloads.
4. **25MB size fallback** — only when byte detection returned `RAW`, the response exceeds 25MB, and `Content-Type` is not text-like (`text/*`, `application/json`, `*+json`, `application/xml`).

File server `get` operations always produce files regardless of detected type.

## Classification

| Classification      | Types                       | Destination                                                    |
| ------------------- | --------------------------- | -------------------------------------------------------------- |
| **Binary**          | PDF, Excel, DOCX, ZIP, GZIP | `producedFiles` + `data` (extracted/parsed content)            |
| **Structured text** | JSON, XML, CSV, YAML, HTML  | `data` only (parsed to JS objects)                             |
| **RAW**             | Unrecognized                | File if attachment/octet-stream/25MB fallback, else raw string |

Binary responses expose `stepFileKeys` and populate `sourceData.__files__`. Structured text responses only populate `sourceData.stepId.data`.

## Auto-Parsing

| Type  | Parsed result                                                 |
| ----- | ------------------------------------------------------------- |
| JSON  | Native JS object/array                                        |
| CSV   | Array of objects (header row = keys)                          |
| XML   | JS object tree                                                |
| HTML  | JS object tree                                                |
| YAML  | Native JS object                                              |
| Excel | Object keyed by sheet name → array of row objects (see below) |
| PDF   | `{ textContent, structuredContent: [{ page, text }] }`        |
| DOCX  | Markdown string                                               |
| ZIP   | Object keyed by entry filename, each value recursively parsed |
| GZIP  | Recursively parsed inner content                              |
| RAW   | UTF-8 string fallback                                         |

### Excel rules

- Excel is NEVER a flat array. It is always `{ "SheetName": [ {row}, ... ] }` — even for single-sheet files.
- Access rows via `extracted.SheetName` or `extracted["Sheet1"]`, never `extracted[0]`.
- When producing xlsx, use namespace `http://schemas.openxmlformats.org/spreadsheetml/2006/main` (not the truncated path).

## file:: Reference Syntax

Use `file::<alias>.<suffix>` in step config `body` / `content` fields:

| Suffix       | Returns                     | Use case                                |
| ------------ | --------------------------- | --------------------------------------- |
| `.raw`       | Original bytes (Uint8Array) | SFTP/FTP put, HTTP raw body upload      |
| `.base64`    | Base64-encoded string       | APIs expecting base64 inside JSON/XML   |
| `.extracted` | Parsed content              | Text fields needing parsed file content |

Constraints:

- Bare `file::<key>` without a suffix is invalid and causes a runtime error.
- File references resolve only in body/content fields, not in headers, query params, or URLs.
- Multi-file steps use bracket notation: `file::stepId["report.csv"].raw`
- Loop iterations use numeric index: `file::stepId[0].raw`
- Base64 access in transforms is capped at 500MB.

## File Aliasing

When a step produces files, the runtime assigns an alias:

| Scenario                    | Alias format                |
| --------------------------- | --------------------------- |
| Single file, non-loop       | `stepId`                    |
| Single file, loop iteration | `stepId[N]`                 |
| Multiple files, non-loop    | `stepId["filename.ext"]`    |
| Multiple files, loop        | `stepId[N]["filename.ext"]` |

Loop steps (those with a `dataSelector` that iterates) always use numeric indices — never filenames — even when each iteration fetches a named file. Filename brackets only appear when a single step or iteration returns multiple files in one response.

These aliases are used both in `file::` references and as keys in `sourceData.__files__`.

## Accessing Files in Transforms

Inside `transformCode` and `outputTransform`, use `sourceData.__files__` with the runtime alias:

```javascript
sourceData.__files__.downloadStep; // single-file step
sourceData.__files__["stepId[0]"]; // loop iteration
```

Prefer discovering aliases dynamically via `stepFileKeys`:

```javascript
(sourceData) => {
  return (sourceData.fetchThreeFiles.stepFileKeys || []).map(function (alias) {
    var f = sourceData.__files__[alias];
    return {
      alias: alias,
      filename: f ? f.filename : null,
      size: f ? f.size : null,
    };
  });
};
```

To produce new files from a transform, return them via a `__files__` key:

```javascript
(sourceData) => ({
  summary: "processed",
  __files__: {
    "output.csv": {
      filename: "output.csv",
      contentType: "text/csv",
      raw: new TextEncoder().encode("a,b\n1,2\n"),
    },
  },
});
```

### `raw` rules

- `raw` accepts: `Uint8Array | ArrayBuffer | number[] | string | object | null`.
  - **String** → UTF-8 encoded. Pass a JSON string for structured data: `raw: JSON.stringify(data)`.
  - **Object / array of objects** → automatically JSON-stringified to UTF-8 bytes. Works, but prefer explicit `JSON.stringify` with a `text/csv` or `application/json` contentType for clarity.
  - **`null` / `undefined`** → produces an empty file (0 bytes).
  - **`Uint8Array` / `ArrayBuffer` / `number[]`** → used as-is for binary content.
- For binary formats (xlsx, zip, pdf): pass through original bytes via `sourceData.__files__.stepId.raw` — never construct the internal file structure as a JS object.

Everything except `__files__` becomes the step's `data`. Single-file transforms get the step ID as alias; multi-file transforms use bracket notation.

## stepFileKeys

Each step result exposes `stepFileKeys` — an array of runtime aliases for files produced by that step:

```javascript
sourceData.downloadStep.stepFileKeys; // ["downloadStep"]
sourceData.batchDownload[0].stepFileKeys; // ["batchDownload[0]"]
```

Use `stepFileKeys` to dynamically discover which file aliases are available.
