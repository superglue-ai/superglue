import assert from "assert";

export default function validate(result: any, payload: any): void {
  assert(result && typeof result === "object", "Result must be an object");
  assert(
    result.insert_summary && typeof result.insert_summary === "object",
    'Result must have an "insert_summary" object',
  );
  assert(
    result.verification && typeof result.verification === "object",
    'Result must have a "verification" object',
  );

  const summary = result.insert_summary;
  const verification = result.verification;

  assert(
    typeof summary.total_records_inserted === "number",
    'insert_summary must have a "total_records_inserted" number',
  );
  assert(
    typeof summary.source_file === "string",
    'insert_summary must have a "source_file" string',
  );
  assert(
    typeof summary.insert_successful === "boolean",
    'insert_summary must have an "insert_successful" boolean',
  );
  assert(
    typeof verification.total_count === "number",
    'verification must have a "total_count" number',
  );
  assert(
    Array.isArray(verification.by_department),
    'verification must have a "by_department" array',
  );
  assert(
    Array.isArray(verification.inactive_employees),
    'verification must have an "inactive_employees" array',
  );

  assert(
    summary.total_records_inserted === 15,
    `Expected 15 records inserted, got ${summary.total_records_inserted}`,
  );
  assert(summary.source_file.includes("employees.csv"), "Source file should be employees.csv");
  assert(summary.insert_successful, "Insert operation should be successful");
  assert(
    verification.total_count === 15,
    `Expected 15 total records in verification, got ${verification.total_count}`,
  );

  assert(
    verification.by_department.length === 5,
    `Expected 5 departments, got ${verification.by_department.length}`,
  );

  const expectedDepartments = {
    Engineering: 6,
    Sales: 3,
    Marketing: 2,
    Finance: 2,
    HR: 2,
  };

  for (const dept of verification.by_department) {
    assert(typeof dept.department === "string", 'Each department must have a "department" string');
    assert(
      typeof dept.employee_count === "number",
      'Each department must have an "employee_count" number',
    );
    assert(typeof dept.avg_salary === "number", 'Each department must have an "avg_salary" number');

    const expected = expectedDepartments[dept.department as keyof typeof expectedDepartments];
    assert(
      expected !== undefined,
      `Unexpected department "${dept.department}" - must be one of: ${Object.keys(expectedDepartments).join(", ")}`,
    );
    assert(
      dept.employee_count === expected,
      `${dept.department} should have ${expected} employees, got ${dept.employee_count}`,
    );
  }

  assert(
    verification.inactive_employees.length === 1,
    `Expected 1 inactive employee, got ${verification.inactive_employees.length}`,
  );
  const inactive = verification.inactive_employees[0];
  assert(
    inactive.employee_id === "EMP009",
    `Expected inactive employee EMP009, got ${inactive.employee_id}`,
  );
  assert(
    inactive.name.includes("Robert") && inactive.name.includes("Lee"),
    `Expected inactive employee name to be Robert Lee, got ${inactive.name}`,
  );

  const engineering = verification.by_department.find((d: any) => d.department === "Engineering");
  assert(
    engineering && Math.abs(engineering.avg_salary - 101666.67) < 100,
    `Engineering avg salary should be around 101666.67, got ${engineering?.avg_salary}`,
  );
}
