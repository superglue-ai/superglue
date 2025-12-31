import assert from "assert";

const EXPECTED_DATA = {
  pages: [
    {
      id: "163848",
      title: "Company Guidelines",
      content:
        "<p>Lorem ipsum dolor sit amet, consetetur sadipscing elitr, sed diam nonumy eirmod tempor invidunt ut</p>",
    },
    {
      id: "295032",
      title: "Docs",
      content: "<p>Overview Page</p>",
    },
    {
      id: "163855",
      title: "Interns",
      content: "<p>Intern Onboarding …</p>",
    },
    {
      id: "295094",
      title: "IT Service Desk",
      content: "<p>Text about the IT Service Desk</p>",
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
