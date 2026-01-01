import assert from 'assert';

export default function validate(data: any, payload: any): void {
  assert(data, 'Data is required');
  assert(data.csv_summary, 'csv_summary field is required');
  assert(data.json_summary, 'json_summary field is required');
  assert(data.fixedwidth_summary, 'fixedwidth_summary field is required');

  const csv = data.csv_summary;
  assert(typeof csv.total_rows === 'number', 'csv_summary.total_rows must be number');
  assert(typeof csv.total_revenue === 'number', 'csv_summary.total_revenue must be number');
  assert(typeof csv.unique_products === 'number', 'csv_summary.unique_products must be number');
  assert(csv.date_range, 'csv_summary.date_range is required');
  assert(typeof csv.date_range.earliest === 'string', 'csv_summary.date_range.earliest must be string');
  assert(typeof csv.date_range.latest === 'string', 'csv_summary.date_range.latest must be string');

  assert(csv.total_rows === 50, `Expected 50 CSV rows, got ${csv.total_rows}`);
  assert(csv.unique_products === 35, `Expected 35 unique products, got ${csv.unique_products}`);
  assert(csv.total_revenue >= 43000 && csv.total_revenue <= 44000, 
    `Expected CSV total revenue ~$43.6k, got ${csv.total_revenue}`);
  assert(csv.date_range.earliest.includes('2024-01'), 
    `Expected earliest date in January 2024, got ${csv.date_range.earliest}`);
  assert(csv.date_range.latest.includes('2024-02'), 
    `Expected latest date in February 2024, got ${csv.date_range.latest}`);

  const json = data.json_summary;
  assert(typeof json.total_users === 'number', 'json_summary.total_users must be number');
  assert(typeof json.users_with_orders === 'number', 'json_summary.users_with_orders must be number');
  assert(typeof json.total_orders === 'number', 'json_summary.total_orders must be number');
  assert(typeof json.total_order_value === 'number', 'json_summary.total_order_value must be number');

  assert(json.total_users === 10, `Expected 10 total users, got ${json.total_users}`);
  assert(json.users_with_orders === 9, `Expected 9 users with orders, got ${json.users_with_orders}`);
  assert(json.total_orders === 14, `Expected 14 total orders, got ${json.total_orders}`);
  assert(json.total_order_value >= 5619 && json.total_order_value <= 5620, 
    `Expected JSON total order value ~$5619.59, got ${json.total_order_value}`);

  const fixed = data.fixedwidth_summary;
  assert(typeof fixed.total_customers === 'number', 'fixedwidth_summary.total_customers must be number');
  assert(typeof fixed.total_balance === 'number', 'fixedwidth_summary.total_balance must be number');
  assert(typeof fixed.avg_age === 'number', 'fixedwidth_summary.avg_age must be number');
  assert(typeof fixed.unique_cities === 'number', 'fixedwidth_summary.unique_cities must be number');

  assert(fixed.total_customers === 20, `Expected 20 total customers, got ${fixed.total_customers}`);
  assert(fixed.total_balance >= 161000 && fixed.total_balance <= 162000, 
    `Expected total balance ~$161.5k, got ${fixed.total_balance}`);
  assert(fixed.avg_age >= 38 && fixed.avg_age <= 39, 
    `Expected average age ~38.5, got ${fixed.avg_age}`);
  assert(fixed.unique_cities === 20, 
    `Expected 20 unique cities, got ${fixed.unique_cities}`);
}

