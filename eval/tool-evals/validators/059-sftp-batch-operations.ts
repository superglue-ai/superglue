import assert from "assert";

export default function validate(result: any, payload: any): void {
  assert(result && typeof result === "object", "Result must be an object");
  assert(
    result.operations && typeof result.operations === "object",
    'Result must have an "operations" object',
  );

  const ops = result.operations;

  assert(typeof ops.upload_count === "number", 'Operations must have an "upload_count" number');
  assert(typeof ops.upload_success === "number", 'Operations must have an "upload_success" number');
  assert(typeof ops.download_count === "number", 'Operations must have a "download_count" number');
  assert(
    typeof ops.download_success === "number",
    'Operations must have a "download_success" number',
  );
  assert(
    typeof ops.content_verification === "boolean",
    'Operations must have a "content_verification" boolean',
  );
  assert(
    typeof ops.cleanup_success === "boolean",
    'Operations must have a "cleanup_success" boolean',
  );
  assert(typeof result.files_remaining === "number", 'Result must have a "files_remaining" number');
  assert(Array.isArray(result.details), 'Result must have a "details" array');

  assert(ops.upload_count === 3, "Expected exactly 3 upload attempts");
  assert(ops.upload_success === 3, "Expected all 3 uploads to succeed");
  assert(ops.download_count === 3, "Expected exactly 3 download attempts");
  assert(ops.download_success === 3, "Expected all 3 downloads to succeed");
  assert(ops.content_verification, "Content verification failed");
  assert(ops.cleanup_success, "Cleanup failed - test files may still exist on server");
  assert(result.details.length === 3, "Expected details for exactly 3 files");

  const expectedFiles = ["file1.txt", "file2.txt", "file3.txt"];
  for (const detail of result.details) {
    assert(expectedFiles.includes(detail.filename), `Unexpected filename: ${detail.filename}`);
    assert(detail.uploaded, `File ${detail.filename} was not uploaded`);
    assert(detail.downloaded, `File ${detail.filename} was not downloaded`);
    assert(detail.content_verified, `File ${detail.filename} content verification failed`);
    assert(detail.deleted, `File ${detail.filename} was not deleted`);
  }
}
