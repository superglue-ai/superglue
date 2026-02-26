import type { SkillName } from "./index";

const CONTENT_DIR = "src/lib/agent/skills/content";

export function loadSkills(names: SkillName[]): string {
  // Dynamic require hidden from Turbopack's static analysis — this only runs server-side
  const fs: typeof import("fs") = eval("require")("fs");
  const path: typeof import("path") = eval("require")("path");
  const dir = path.join(process.cwd(), CONTENT_DIR);
  return names
    .map((name) => fs.readFileSync(path.join(dir, `${name}.md`), "utf-8"))
    .join("\n\n---\n\n");
}
