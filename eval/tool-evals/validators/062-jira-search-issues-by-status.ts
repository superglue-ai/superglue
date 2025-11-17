import assert from 'assert';

export default function validate(result: any, payload: any): void {
  assert(result && typeof result === 'object', 'Result must be an object');
  assert(result.summary && typeof result.summary === 'object', 'Result must have a "summary" object');

  const summary = result.summary;
  
  assert(typeof summary.total_issues === 'number', 'Summary must have a "total_issues" number');
  assert(typeof summary.total_statuses === 'number', 'Summary must have a "total_statuses" number');
  assert(Array.isArray(result.by_status), 'Result must have a "by_status" array');
  assert(Array.isArray(result.in_progress_issues), 'Result must have an "in_progress_issues" array');

  assert(summary.total_issues === 22, `Expected 22 total issues, got ${summary.total_issues}`);
  assert(summary.total_statuses === 4, `Expected 4 statuses, got ${summary.total_statuses}`);
  assert(result.by_status.length === 4, `Expected 4 status categories, got ${result.by_status.length}`);

  const expectedStatuses = {
    'To Do': 10,
    'In Progress': 5,
    'Ready for Launch': 4,
    'Launched': 3
  };

  for (const status of result.by_status) {
    assert(typeof status.status === 'string', 'Each status must have a "status" string');
    assert(typeof status.count === 'number', 'Each status must have a "count" number');

    const expected = expectedStatuses[status.status as keyof typeof expectedStatuses];
    if (expected) {
      assert(status.count === expected, `Status "${status.status}" should have ${expected} issues, got ${status.count}`);
    }
  }

  assert(result.in_progress_issues.length === 5, `Expected 5 'In Progress' issues, got ${result.in_progress_issues.length}`);

  const expectedInProgressKeys = ['GTMS-20', 'GTMS-9', 'GTMS-7', 'GTMS-3', 'GTMS-1'];
  for (const issue of result.in_progress_issues) {
    assert(typeof issue.key === 'string', 'Each issue must have a "key" string');
    assert(typeof issue.summary === 'string', 'Each issue must have a "summary" string');
    assert(issue.assignee === null || typeof issue.assignee === 'string', 'Each issue must have an "assignee" string or null');
    assert(expectedInProgressKeys.includes(issue.key), `Unexpected issue key: ${issue.key}`);
  }
}

