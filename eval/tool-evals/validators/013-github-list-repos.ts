import assert from "assert";

const EXPECTED_DATA = {
  repositories: [
    {
      id: 1074517465,
      name: "congenial-tribble",
      isPublic: false,
    },
    {
      id: 1074517568,
      name: "expert-octo-doodle",
      isPublic: false,
    },
    {
      id: 1074520812,
      name: "strapi-cloud-template-blog-4b5423dbba",
      isPublic: true,
    },
    {
      id: 1074517305,
      name: "Test1",
      isPublic: false,
    },
    {
      id: 1074517689,
      name: "vigilant-octo-lamp",
      isPublic: false,
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
