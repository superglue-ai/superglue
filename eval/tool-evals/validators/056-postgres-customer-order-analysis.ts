import assert from 'assert';

export default function validate(result: any, payload: any): void {
  assert(result && typeof result === 'object', 'Result must be an object');
  assert(result.summary && typeof result.summary === 'object', 'Result must have a "summary" object');

  const summary = result.summary;
  
  assert(typeof summary.total_orders === 'number', 'Summary must have a "total_orders" number');
  assert(typeof summary.completed_orders === 'number', 'Summary must have a "completed_orders" number');
  assert(typeof summary.pending_orders === 'number', 'Summary must have a "pending_orders" number');
  assert(typeof summary.failed_orders === 'number', 'Summary must have a "failed_orders" number');
  assert(typeof summary.total_revenue === 'number', 'Summary must have a "total_revenue" number');
  assert(Array.isArray(result.by_customer), 'Result must have a "by_customer" array');

  assert(summary.total_orders === 9, `Expected 9 total orders, got ${summary.total_orders}`);
  assert(summary.completed_orders === 7, `Expected 7 completed orders, got ${summary.completed_orders}`);
  assert(summary.pending_orders === 1, `Expected 1 pending order, got ${summary.pending_orders}`);
  assert(summary.failed_orders === 1, `Expected 1 failed order, got ${summary.failed_orders}`);

  const expectedRevenue = 2554.87;
  assert(Math.abs(summary.total_revenue - expectedRevenue) <= 1, `Expected total revenue around ${expectedRevenue}, got ${summary.total_revenue}`);

  for (const customer of result.by_customer) {
    assert(typeof customer.customer_name === 'string', 'Each customer must have a "customer_name" string');
    assert(typeof customer.order_count === 'number', 'Each customer must have an "order_count" number');
    assert(typeof customer.total_spent === 'number', 'Each customer must have a "total_spent" number');
    assert(typeof customer.most_purchased_category === 'string', 'Each customer must have a "most_purchased_category" string');
  }

  const topCustomer = result.by_customer[0];
  assert(topCustomer && topCustomer.customer_name === 'John Smith', `Expected top customer to be John Smith, got ${topCustomer?.customer_name}`);
  assert(topCustomer && Math.abs(topCustomer.total_spent - 1959.96) <= 1, `Expected John Smith to have spent ~1959.96, got ${topCustomer?.total_spent}`);
}
