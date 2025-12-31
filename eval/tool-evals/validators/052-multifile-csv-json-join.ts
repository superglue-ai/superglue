import assert from "assert";

export default function validate(data: any, payload: any): void {
  assert(data, "Data is required");
  assert(data.matched_sales, "matched_sales field is required");
  assert(Array.isArray(data.matched_sales), "matched_sales must be an array");
  assert(
    data.matched_sales.length === 4,
    `Expected 4 salespeople, got ${data.matched_sales.length}`,
  );

  for (const sale of data.matched_sales) {
    assert(typeof sale.salesperson === "string", "Each sale must have salesperson string");
    assert(typeof sale.total_revenue === "number", "Each sale must have total_revenue number");
    assert(sale.email === null || typeof sale.email === "string", "email must be string or null");
    assert(sale.total_revenue > 0, "Total revenue must be positive");
  }

  const salespeople = data.matched_sales.map((s: any) => s.salesperson);
  const expectedSalespeople = ["Alice Johnson", "Bob Smith", "Charlie Davis", "Diana Lee"];

  for (const expected of expectedSalespeople) {
    assert(salespeople.includes(expected), `Expected to find salesperson ${expected}`);
  }

  for (const sale of data.matched_sales) {
    assert(
      expectedSalespeople.includes(sale.salesperson),
      `Unexpected salesperson: ${sale.salesperson}`,
    );
  }

  const revenueValues = data.matched_sales.map((s: any) => s.total_revenue);
  for (const revenue of revenueValues) {
    assert(revenue > 1000, `Revenue seems too low: ${revenue}. Check aggregation logic.`);
  }
}
