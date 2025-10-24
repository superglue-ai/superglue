import assert from 'assert';

const EXPECTED_DATA = {
  "lists": [
    {
      "id": "901516249723",
      "name": "Projekt 1",
      "content": "Project one's text",
      "due_date": "2025-11-06",
      "start_date": "2025-10-15"
    },
    {
      "id": "901516249722",
      "name": "Projekt 2",
      "content": "",
      "due_date": null,
      "start_date": null
    },
    {
      "id": "901516361522",
      "name": "Test",
      "content": "",
      "due_date": null,
      "start_date": null
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


