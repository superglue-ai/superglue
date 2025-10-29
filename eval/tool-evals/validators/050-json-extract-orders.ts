import assert from 'assert';

export default function validate(data: any, payload: any): void {
  assert(data, 'Data is required');
  assert(data.order_summary, 'order_summary field is required');
  assert(Array.isArray(data.order_summary), 'order_summary must be an array');
  assert(data.order_summary.length === 9, `Expected 9 users with orders (U004 has none), got ${data.order_summary.length}`);

  let totalOrders = 0;
  
  for (const summary of data.order_summary) {
    assert(typeof summary.user_id === 'string', 'Each summary must have user_id string');
    assert(typeof summary.user_name === 'string', 'Each summary must have user_name string');
    assert(typeof summary.order_count === 'number', 'Each summary must have order_count number');
    assert(typeof summary.total_value === 'number', 'Each summary must have total_value number');
    assert(summary.order_count > 0, 'Order count must be positive');
    assert(summary.total_value > 0, 'Total value must be positive');
    
    totalOrders += summary.order_count;
  }

  assert(totalOrders === 14, `Expected total of 14 orders across all users, got ${totalOrders}`);

  const userIds = data.order_summary.map((s: any) => s.user_id);
  assert(!userIds.includes('U004'), 'U004 (Emily Davis) should not be included as she has no orders');

  for (let i = 0; i < data.order_summary.length - 1; i++) {
    const current = data.order_summary[i].total_value;
    const next = data.order_summary[i + 1].total_value;
    assert(current >= next, `Order summary should be sorted by total_value descending. ${current} should be >= ${next}`);
  }

  const topUser = data.order_summary[0];
  assert(topUser.user_id === 'U001', `Expected U001 (John Smith) to have highest total, got ${topUser.user_id}`);
  assert(topUser.order_count === 2, `Expected John Smith to have 2 orders, got ${topUser.order_count}`);
  
  const expectedTotal = 1759.96;
  const tolerance = 0.02;
  assert(
    Math.abs(topUser.total_value - expectedTotal) < tolerance,
    `Expected John Smith's total to be ~${expectedTotal}, got ${topUser.total_value}`
  );
}

