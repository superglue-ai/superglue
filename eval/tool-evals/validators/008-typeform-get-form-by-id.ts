import assert from "assert";

const EXPECTED_DATA = {
  id: "lyyDJUcC",
  name: "Coffee Shop Applications",
  responses: [
    {
      id: "zrf8owa8sa9aq94pd6rmdzrf8ow4jewu",
      answers: [
        {
          question: "What is your full name?",
          answer: "Peter Mustermann",
        },
        {
          question: "Which position are you applying for?",
          answer: "Cashier",
        },
        {
          question: "Please share a brief overview of your work experience.",
          answer: "Peter's text",
        },
        {
          question: "Why would you like to work at our coffee shop?",
          answer: "Random text",
        },
      ],
      submittedAt: 1760610533,
    },
  ],
  createdAt: 1760610392,
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
