import assert from 'assert';

const EXPECTED_DATA = {
  "products": [
    {
      "title": "Non-Repairable Return",
      "updated_at": "2025-10-19T14:22:18-07:00"
    },
    {
      "title": "Non-Repairable Recycle",
      "updated_at": "2025-10-19T14:22:18-07:00"
    },
    {
      "title": "Non-Payment Return",
      "updated_at": "2025-10-19T14:22:18-07:00"
    },
    {
      "title": "Non-Payment Recycle",
      "updated_at": "2025-10-19T14:22:18-07:00"
    },
    {
      "title": "Flight Crossbody Sling Bag",
      "updated_at": "2025-10-19T14:22:18-07:00"
    },
    {
      "title": "Flight Crossbody Satchel",
      "updated_at": "2025-10-19T14:22:18-07:00"
    },
    {
      "title": "Flight Convertible Tote Backpack",
      "updated_at": "2025-10-19T14:22:18-07:00"
    },
    {
      "title": "Flight Backpack",
      "updated_at": "2025-10-19T14:22:18-07:00"
    },
    {
      "title": "Flight Classic Messenger Bag",
      "updated_at": "2025-10-19T14:22:18-07:00"
    },
    {
      "title": "Miles Chest Pack",
      "updated_at": "2025-10-19T14:22:18-07:00"
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


