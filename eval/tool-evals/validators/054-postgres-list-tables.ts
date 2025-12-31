import assert from "assert";

export default function validate(result: any, payload: any): void {
  assert(result && typeof result === "object", "Result must be an object");
  assert(Array.isArray(result.tables), 'Result must have a "tables" array');

  const expectedTables = ["eval_customers", "eval_employees", "eval_orders", "eval_products"];

  const actualTables = result.tables.map((t: string) => t.toLowerCase());

  for (const expected of expectedTables) {
    assert(actualTables.includes(expected), `Missing expected table: ${expected}`);
  }
}
