import assert from 'assert';

export default function validate(data: any, payload: any): void {
  assert(data, 'Data is required');
  assert(data.top_performers, 'top_performers field is required');
  assert(Array.isArray(data.top_performers), 'top_performers must be an array');
  assert(data.top_performers.length === 3, `Expected exactly 3 top performers, got ${data.top_performers.length}`);

  for (const performer of data.top_performers) {
    assert(typeof performer.name === 'string', 'Each performer must have a name string');
    assert(typeof performer.total_revenue === 'number', 'Each performer must have total_revenue as number');
    assert(typeof performer.region === 'string', 'Each performer must have a region string');
    assert(typeof performer.sales_count === 'number', 'Each performer must have sales_count as number');
    assert(performer.total_revenue > 0, 'Revenue must be positive');
    assert(performer.sales_count > 0, 'Sales count must be positive');
  }

  const names = data.top_performers.map((p: any) => p.name);
  const expectedNames = ['Alice Johnson', 'Bob Smith', 'Charlie Davis', 'Diana Lee'];
  
  for (const name of names) {
    assert(expectedNames.includes(name), `Unexpected salesperson name: ${name}`);
  }

  for (let i = 0; i < data.top_performers.length - 1; i++) {
    const current = data.top_performers[i].total_revenue;
    const next = data.top_performers[i + 1].total_revenue;
    assert(current >= next, `Top performers should be sorted by revenue descending. ${current} should be >= ${next}`);
  }

  const validRegions = ['North', 'South', 'East', 'West'];
  for (const performer of data.top_performers) {
    assert(validRegions.includes(performer.region), `Invalid region: ${performer.region}`);
  }
}

