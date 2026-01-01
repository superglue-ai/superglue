import assert from 'assert';

const EXPECTED_DATA = {
  "projects": [
    {
      "id": "68eaed6cf78d45743dec5b43",
      "name": "Buchhaltung 2025",
      "note": "Some notes",
      "billable": false,
      "hourlyRate": 0,
      "hourlyRateCurrency": "USD"
    },
    {
      "id": "68eaed36c0a1d045ac1d6fbc",
      "name": "Marketing Project X",
      "note": "",
      "billable": true,
      "hourlyRate": 8000,
      "hourlyRateCurrency": "USD"
    }
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


