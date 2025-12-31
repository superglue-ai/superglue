import assert from "assert";

const EXPECTED_DATA = {
  pullRequests: [
    {
      id: 3527944071,
      title: "Test something",
      url: "https://github.com/Evals304/congenial-tribble/pull/1",
      updatedAt: "2025-10-18T01:46:27Z",
      createdAt: "2025-10-18T01:46:27Z",
    },
    {
      id: 3527943775,
      title: "Update README.md",
      url: "https://github.com/Evals304/vigilant-octo-lamp/pull/1",
      updatedAt: "2025-10-18T01:45:59Z",
      createdAt: "2025-10-18T01:45:59Z",
    },
  ],
};

function isDeepEqual(expected: any, received: any): boolean {
  if (expected === received) return true;
  if (expected == null || received == null) return false;
  if (typeof expected !== "object" || typeof received !== "object") return false;

  const keysExpected = Object.keys(expected);
  const keysReceived = Object.keys(received);

  if (keysExpected.length !== keysReceived.length) return false;

  for (const key of keysExpected) {
    if (
      !Object.prototype.hasOwnProperty.call(received, key) ||
      !isDeepEqual(expected[key], received[key])
    ) {
      return false;
    }
  }

  return true;
}

export default function validate(data: any, payload: any): void {
  assert(
    isDeepEqual(EXPECTED_DATA, data),
    `Data does not match expected structure. Expected: ${JSON.stringify(EXPECTED_DATA)}, Received: ${JSON.stringify(data)}`,
  );
}
