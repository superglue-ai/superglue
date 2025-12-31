import assert from "assert";

export default function validate(data: any, payload: any): void {
  // Example validation using assertions
  // Throw an error (AssertionError or custom Error) if validation fails

  assert(data, "data must exist");
  assert(typeof data === "object", "data must be an object");

  // Example: Check for required keys
  // assert(data.customers, 'customers key must exist');
  // assert(Array.isArray(data.customers), 'customers must be an array');
  // assert(data.customers.length > 0, 'must have at least one customer');

  // Example: Check data types
  // assert(typeof data.total === 'number', 'total must be a number');

  // Example: Check value ranges
  // assert(data.total >= 0, 'total must be non-negative');

  // Example: Check payload-based conditions
  // if (payload.minCount) {
  //   assert(data.items.length >= payload.minCount, `must have at least ${payload.minCount} items`);
  // }
}
