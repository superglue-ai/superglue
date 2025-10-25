import assert from 'assert';

const EXPECTED_DATA = {
  "themes": [
    { "name": "Gear", "setCount": 246 },
    { "name": "Supplemental", "setCount": 240 },
    { "name": "Duplo", "setCount": 219 },
    { "name": "City", "setCount": 216 },
    { "name": "Friends", "setCount": 192 },
    { "name": "Ninjago", "setCount": 191 },
    { "name": "Service Packs", "setCount": 185 },
    { "name": "Technic", "setCount": 172 },
    { "name": "Creator", "setCount": 148 },
    { "name": "Technic", "setCount": 140 },
    { "name": "Basic Set", "setCount": 134 },
    { "name": "Key Chain", "setCount": 132 },
    { "name": "Bulk Bricks", "setCount": 125 },
    { "name": "Star Wars Episode 4/5/6", "setCount": 118 },
    { "name": "Basic", "setCount": 106 },
    { "name": "Star Wars", "setCount": 105 },
    { "name": "Police", "setCount": 103 },
    { "name": "Soccer", "setCount": 102 },
    { "name": "Supplemental", "setCount": 99 },
    { "name": "Star Wars", "setCount": 97 }
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


