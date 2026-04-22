export const SKILL_NAMES = [
  "superglue-concepts",
  "data-handling",
  "file-handling",
  "http-apis",
  "databases",
  "redis",
  "file-servers",
  "tool-building",
  "tool-editing",
  "systems-handling",
  "access-rules",
  "demos",
] as const;

export type SkillName = (typeof SKILL_NAMES)[number];

export const SKILL_INDEX: Record<SkillName, string> = {
  "superglue-concepts": "Core mental model — tools, systems, steps, execution pipeline",
  "data-handling":
    "<<>> syntax, data selectors, result envelopes, credential injection, sourceData structure, JS sandbox constraints",
  "file-handling":
    "File detection, binary vs text classification, producedFiles, file:: reference syntax, aliasing rules, auto-parsing, sourceData.__files__",
  "http-apis": "HTTP step config — auth patterns, pagination, retries, error detection",
  databases:
    "PostgreSQL and MSSQL/Azure SQL step config — connections, queries, parameterization, protocol differences",
  redis: "Redis step config — connection, commands, key-value/hash/list/set operations",
  "file-servers": "FTP/SFTP/SMB steps — identical operation interface, batch ops",
  "tool-building":
    "Build recipe, tool config schema, step planning rules, validation, common pitfalls. Includes: build_tool, save_tool",
  "tool-editing":
    "JSON Patch format, tool structure, patch operations, validation, partial approval, debugging with step results. Includes: edit_tool, save_tool",
  "systems-handling":
    "Creating/editing systems, credentials, OAuth setup, templates, documentation. Includes: create_system, edit_system, authenticate_oauth",
  "access-rules":
    "Enterprise-only RBAC reference — data model, tool/system permissions, custom rules, enforcement layers, multi-role semantics",
  demos:
    "Guided onboarding demo flow using httpbin: create system, build tool, run tool, and narrate mapping to real systems",
};
