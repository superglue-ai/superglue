import assert from 'assert';

const EXPECTED_DATA = {
  "comments": [
    {
      "id": "90150163803004",
      "authorId": "242688065",
      "authorName": "Max Mustermann",
      "text": "Second comment without replies\n",
      "parentCommentId": null,
      "createdAt": "2025-10-14"
    },
    {
      "id": "90150163802974",
      "authorId": "242688065",
      "authorName": "Max Mustermann",
      "text": "One comment\n",
      "parentCommentId": null,
      "createdAt": "2025-10-14"
    },
    {
      "id": "90150163802992",
      "authorId": "242688065",
      "authorName": "Max Mustermann",
      "text": "Sub comment\n",
      "parentCommentId": "90150163802974",
      "createdAt": "2025-10-14"
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


