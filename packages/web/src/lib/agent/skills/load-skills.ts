import type { SkillName } from "./index";

const CONTENT_SUBPATH = "src/lib/agent/skills/content";

// Candidate locations for the skill content directory, resolved against the
// current working directory. Dev runs the web server with cwd = packages/web,
// while the Docker image runs with cwd = repo root (/usr/src/app) and the
// content lives under packages/web/. Probing both keeps skill loading working
// in every environment without depending on a specific cwd.
const CANDIDATE_SUBPATHS = [CONTENT_SUBPATH, `packages/web/${CONTENT_SUBPATH}`];

export function loadSkills(names: SkillName[]): string {
  // Dynamic require hidden from Turbopack's static analysis — this only runs server-side
  const fs: typeof import("fs") = eval("require")("fs");
  const path: typeof import("path") = eval("require")("path");

  const dir = CANDIDATE_SUBPATHS.map((subPath) => path.join(process.cwd(), subPath)).find(
    (candidate) => fs.existsSync(candidate),
  );

  if (!dir) {
    throw new Error(
      `Skill content directory not found. Looked for [${CANDIDATE_SUBPATHS.join(", ")}] relative to ${process.cwd()}`,
    );
  }

  return names
    .map((name) => fs.readFileSync(path.join(dir, `${name}.md`), "utf-8"))
    .join("\n\n---\n\n");
}
