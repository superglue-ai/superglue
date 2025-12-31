import assert from "assert";

export default function validate(result: any, payload: any): void {
  assert(result && typeof result === "object", "Result must be an object");
  assert(typeof result.project_count === "number", 'Result must have a "project_count" number');
  assert(Array.isArray(result.projects), 'Result must have a "projects" array');
  assert(
    result.project_count === result.projects.length,
    "project_count must match projects array length",
  );

  assert(result.projects.length === 3, `Expected 3 projects, got ${result.projects.length}`);

  const expectedProjects = {
    GTMS: { name: "Go to market sample", type: "business" },
    LEARNJIRA: { name: "Learn Jira in 10 minutes 👋", type: "software" },
    KAN: { name: "My Kanban Project", type: "software" },
  };

  for (const project of result.projects) {
    assert(typeof project.key === "string", 'Each project must have a "key" string');
    assert(typeof project.name === "string", 'Each project must have a "name" string');
    assert(
      typeof project.projectTypeKey === "string",
      'Each project must have a "projectTypeKey" string',
    );

    const expected = expectedProjects[project.key as keyof typeof expectedProjects];
    if (expected) {
      assert(
        project.name === expected.name,
        `Project ${project.key} should be named "${expected.name}", got "${project.name}"`,
      );
      assert(
        project.projectTypeKey === expected.type,
        `Project ${project.key} should have type "${expected.type}", got "${project.projectTypeKey}"`,
      );
    }
  }

  const projectKeys = result.projects.map((p: any) => p.key);
  assert(projectKeys.includes("GTMS"), "Missing GTMS project");
  assert(projectKeys.includes("LEARNJIRA"), "Missing LEARNJIRA project");
  assert(projectKeys.includes("KAN"), "Missing KAN project");
}
