import assert from 'assert';

const EXPECTED_DATA = {
  "products": [
    {
      "id": "prod_TGbk1E8pRkHR51",
      "object": "product",
      "active": true,
      "created": 1760910770,
      "updated": 1760910770,
      "name": "Superglue Cap"
    },
    {
      "id": "prod_TGbjqL1f2Rqqkv",
      "object": "product",
      "active": true,
      "created": 1760910683,
      "updated": 1760910683,
      "name": "Superglue T-Shirt"
    },
    {
      "id": "prod_TGbixpbyW32QWP",
      "object": "product",
      "active": true,
      "created": 1760910671,
      "updated": 1760910671,
      "name": "Superglue Coffee Mug"
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


