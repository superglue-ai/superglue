import assert from "assert";

const EXPECTED_DATA = {
  projects: [
    {
      id: "7c811f73-677a-4040-80be-0ff374f951b2",
      name: "Empty 2",
    },
    {
      id: "fb067dcf-0867-4fbb-b409-4565411015f2",
      name: "Empty1",
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
