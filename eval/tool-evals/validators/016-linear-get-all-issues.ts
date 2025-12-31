import assert from "assert";

const EXPECTED_DATA = {
  issues: [
    {
      id: "91d119b6-8c91-436e-9986-0198cf30cd8e",
      title: "Third",
    },
    {
      id: "4ba8526b-40b1-42cb-9cd4-9b273ed82eb7",
      title: "Second",
    },
    {
      id: "ba4a3f19-45af-4597-b165-bb2cd37aa0ec",
      title: "First",
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
