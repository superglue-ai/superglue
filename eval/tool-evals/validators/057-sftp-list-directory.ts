import assert from "assert";

export default function validate(result: any, payload: any): void {
  assert(result && typeof result === "object", "Result must be an object");
  assert(Array.isArray(result.files), 'Result must have a "files" array');

  for (const file of result.files) {
    assert(typeof file.name === "string", 'Each file must have a "name" string');
    assert(
      file.type === "file" || file.type === "directory",
      'Each file must have a "type" of either "file" or "directory"',
    );
  }

  const hasUploadsDir = result.files.some(
    (f: any) => f.name === "uploads" && f.type === "directory",
  );

  assert(hasUploadsDir, 'Expected to find "uploads" directory in file list');
}
