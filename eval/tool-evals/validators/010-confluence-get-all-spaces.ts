import assert from "assert";

const EXPECTED_DATA = {
  spaces: [
    {
      id: 294916,
      type: "knowledge_base",
      name: "Docs",
      archived: false,
    },
    {
      id: 196611,
      type: "personal",
      name: "Max Mustermann",
      archived: false,
    },
    {
      id: 98312,
      type: "onboarding",
      name: "Projektmanagement",
      archived: true,
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
