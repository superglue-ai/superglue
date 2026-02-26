export const SKILL_NAMES = [
  "superglue-concepts",
  "variables-and-data-flow",
  "http-apis",
  "databases",
  "file-servers",
  "transforms-and-output",
  "tool-building",
  "tool-fixing",
  "systems-handling",
] as const;

export type SkillName = (typeof SKILL_NAMES)[number];

export const SKILL_INDEX: Record<SkillName, string> = {
  "superglue-concepts": "Core mental model — tools, systems, steps, execution pipeline",
  "variables-and-data-flow":
    "<<>> syntax, data selectors, result envelope, credential injection — #1 source of errors",
  "http-apis": "HTTP step config — auth patterns, pagination, retries, error detection",
  databases: "PostgreSQL step config — connection, queries, parameterization",
  "file-servers": "FTP/SFTP/SMB steps — identical operation interface, batch ops",
  "transforms-and-output": "dataSelectors, transform steps, outputTransform, response filters",
  "tool-building":
    "Build recipe, tool config schema, step planning rules, validation, common pitfalls",
  "tool-fixing": "JSON Patch format, tool structure, patch operations, validation, common fixes",
  "systems-handling":
    "Creating/editing systems, credentials, OAuth setup, templates, documentation",
};
