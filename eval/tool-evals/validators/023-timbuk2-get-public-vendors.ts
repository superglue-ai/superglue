import assert from 'assert';

const EXPECTED_DATA = {
  "vendors": [
    "Timbuk2-Timbuk2",
    "Timbuk2-Corporate",
    "Timbuk2-Sale",
    "Timbuk2-Corporate-Sale"
  ]
};

function isDeepEqual(expected: any, received: any): boolean {
  if (expected === received) return true;
  if (expected == null || received == null) return false;
  if (typeof expected !== "object" || typeof received !== "object") return false;

  const keysExpected = Object.keys(expected);
  const keysReceived = Object.keys(received);

  if (keysExpected.length !== keysReceived.length) return false;

  for (const key of keysExpected) {
    if (!Object.prototype.hasOwnProperty.call(received, key) || !isDeepEqual(expected[key], received[key])) {
      return false;
    }
  }

  return true;
}

export default function validate(data: any, payload: any): void {
  assert(isDeepEqual(EXPECTED_DATA, data), `Data does not match expected structure. Expected: ${JSON.stringify(EXPECTED_DATA)}, Received: ${JSON.stringify(data)}`);
}


