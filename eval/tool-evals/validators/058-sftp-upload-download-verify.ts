import assert from "assert";

export default function validate(result: any, payload: any): void {
  assert(result && typeof result === "object", "Result must be an object");
  assert(
    result.status === "success" || result.status === "failure",
    'Result must have a "status" of either "success" or "failure"',
  );
  assert(
    typeof result.uploaded_filename === "string",
    'Result must have an "uploaded_filename" string',
  );
  assert(
    typeof result.content_matches === "boolean",
    'Result must have a "content_matches" boolean',
  );
  assert(
    typeof result.original_content === "string",
    'Result must have an "original_content" string',
  );
  assert(
    typeof result.downloaded_content === "string",
    'Result must have a "downloaded_content" string',
  );

  assert(result.status === "success", "Upload/download operation failed");
  assert(result.content_matches, "Uploaded and downloaded content do not match");
  assert(
    result.original_content === result.downloaded_content,
    "Original and downloaded content must match",
  );
  assert(
    result.uploaded_filename.startsWith("eval_test_"),
    'Uploaded filename should start with "eval_test_"',
  );
  assert(
    result.original_content.startsWith("SFTP Eval Test -"),
    'Original content should start with "SFTP Eval Test -"',
  );
}
