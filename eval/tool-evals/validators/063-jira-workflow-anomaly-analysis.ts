import assert from "assert";

export default function validate(result: any, payload: any): void {
  assert(result && typeof result === "object", "Result must be an object");
  assert(
    result.metrics && typeof result.metrics === "object",
    'Result must have a "metrics" object',
  );
  assert(Array.isArray(result.by_assignee), 'Result must have a "by_assignee" array');
  assert(
    result.anomalies && typeof result.anomalies === "object",
    'Result must have an "anomalies" object',
  );
  assert(Array.isArray(result.by_issue_type), 'Result must have a "by_issue_type" array');

  const metrics = result.metrics;

  assert(typeof metrics.total_issues === "number", 'Metrics must have a "total_issues" number');
  assert(
    typeof metrics.assigned_count === "number",
    'Metrics must have an "assigned_count" number',
  );
  assert(
    typeof metrics.unassigned_count === "number",
    'Metrics must have an "unassigned_count" number',
  );
  assert(typeof metrics.backlog_count === "number", 'Metrics must have a "backlog_count" number');
  assert(
    typeof metrics.backlog_percentage === "number",
    'Metrics must have a "backlog_percentage" number',
  );

  assert(metrics.total_issues === 22, `Expected 22 total issues, got ${metrics.total_issues}`);
  assert(metrics.assigned_count === 3, `Expected 3 assigned issues, got ${metrics.assigned_count}`);
  assert(
    metrics.unassigned_count === 19,
    `Expected 19 unassigned issues, got ${metrics.unassigned_count}`,
  );
  assert(metrics.backlog_count === 10, `Expected 10 backlog issues, got ${metrics.backlog_count}`);
  assert(
    Math.abs(metrics.backlog_percentage - 45.45) < 2,
    `Expected backlog percentage ~45% (45.45%), got ${metrics.backlog_percentage}%`,
  );

  for (const assignee of result.by_assignee) {
    assert(typeof assignee.assignee === "string", 'Each assignee must have an "assignee" string');
    assert(
      typeof assignee.issue_count === "number",
      'Each assignee must have an "issue_count" number',
    );
    assert(Array.isArray(assignee.statuses), 'Each assignee must have a "statuses" array');

    for (const status of assignee.statuses) {
      assert(typeof status.status === "string", 'Each status must have a "status" string');
      assert(typeof status.count === "number", 'Each status must have a "count" number');
    }
  }

  const stefanAssignee = result.by_assignee.find((a: any) => a.assignee === "Stefan Faistenauer");
  const unassignedAssignee = result.by_assignee.find((a: any) => a.assignee === "Unassigned");

  assert(stefanAssignee, "Expected to find Stefan Faistenauer in assignee list");
  assert(
    stefanAssignee.issue_count === 3,
    `Stefan should have 3 issues, got ${stefanAssignee.issue_count}`,
  );

  assert(unassignedAssignee, "Expected to find Unassigned in assignee list");
  assert(
    unassignedAssignee.issue_count === 19,
    `Unassigned should have 19 issues, got ${unassignedAssignee.issue_count}`,
  );

  assert(
    Array.isArray(result.anomalies.unassigned_in_progress),
    'Anomalies must have an "unassigned_in_progress" array',
  );
  assert(typeof result.anomalies.count === "number", 'Anomalies must have a "count" number');

  assert(
    result.anomalies.count === 3,
    `Expected 3 unassigned in-progress anomalies, got ${result.anomalies.count}`,
  );

  const anomalyKeys = result.anomalies.unassigned_in_progress.map((i: any) => i.key);
  assert(anomalyKeys.includes("GTMS-20"), "Missing anomaly GTMS-20");
  assert(anomalyKeys.includes("GTMS-3"), "Missing anomaly GTMS-3");
  assert(anomalyKeys.includes("GTMS-1"), "Missing anomaly GTMS-1");

  const taskType = result.by_issue_type.find((t: any) => t.type === "Task");
  const subtaskType = result.by_issue_type.find((t: any) => t.type === "Sub-task");

  assert(taskType && taskType.count === 15, `Expected 15 Tasks, got ${taskType?.count}`);
  assert(subtaskType && subtaskType.count === 7, `Expected 7 Sub-tasks, got ${subtaskType?.count}`);
}
