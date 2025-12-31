import assert from "assert";

export default function validate(data: any, payload: any): void {
  assert(data, "Data is required");
  assert(data.customers, "customers field is required");
  assert(Array.isArray(data.customers), "customers must be an array");
  assert(data.customers.length === 20, `Expected 20 customers, got ${data.customers.length}`);

  for (const customer of data.customers) {
    assert(typeof customer.customer_id === "string", "customer_id must be string");
    assert(typeof customer.name === "string", "name must be string");
    assert(typeof customer.age === "number", "age must be number");
    assert(typeof customer.city === "string", "city must be string");
    assert(typeof customer.balance === "number", "balance must be number");

    assert(Number.isInteger(customer.age), "age must be an integer");
    assert(customer.age > 0 && customer.age < 120, `age must be reasonable, got ${customer.age}`);
    assert(customer.balance > 0, "balance must be positive");

    assert(customer.customer_id.trim() === customer.customer_id, "customer_id should be trimmed");
    assert(customer.name.trim() === customer.name, "name should be trimmed");
    assert(customer.city.trim() === customer.city, "city should be trimmed");

    assert(customer.customer_id.length > 0, "customer_id should not be empty");
    assert(customer.name.length > 0, "name should not be empty");
    assert(customer.city.length > 0, "city should not be empty");
  }

  const firstCustomer = data.customers[0];
  assert(
    firstCustomer.customer_id === "C00000001",
    `Expected first customer ID to be C00000001, got ${firstCustomer.customer_id}`,
  );
  assert(
    firstCustomer.name === "Alice Johnson",
    `Expected first customer name to be Alice Johnson, got ${firstCustomer.name}`,
  );
  assert(
    firstCustomer.city === "New York",
    `Expected first customer city to be New York, got ${firstCustomer.city}`,
  );
  assert(
    firstCustomer.age === 35,
    `Expected first customer age to be 35, got ${firstCustomer.age}`,
  );

  const expectedBalance = 5250.75;
  const tolerance = 0.01;
  assert(
    Math.abs(firstCustomer.balance - expectedBalance) < tolerance,
    `Expected first customer balance to be ${expectedBalance}, got ${firstCustomer.balance}`,
  );

  const customerIds = data.customers.map((c: any) => c.customer_id);
  assert(customerIds.includes("C00000001"), "Expected customer C00000001");
  assert(customerIds.includes("C00000020"), "Expected customer C00000020");
}
