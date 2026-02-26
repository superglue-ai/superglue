import { SupportedFileType } from "@superglue/shared";
import yaml from "js-yaml";
import { DetectionPriority, FileParsingStrategy } from "../strategy.js";

export class YAMLStrategy implements FileParsingStrategy {
  readonly fileType = SupportedFileType.YAML;
  readonly priority = DetectionPriority.STRUCTURED_TEXT;

  canHandle(buffer: Buffer): boolean {
    const sampleSize = Math.min(buffer.length, 4096);
    const sample = buffer.subarray(0, sampleSize).toString("utf8").trim();

    if (sample.startsWith("%YAML")) return true;

    if (sample.startsWith("{") || sample.startsWith("[")) return false;

    const lines = sample.split(/\r?\n/);
    const nonEmptyLines = lines.filter((l) => l.trim().length > 0);
    if (nonEmptyLines.length === 0) return false;

    if (lines[0]?.trim() === "---") return true;

    const kvPattern = /^[\w][\w.-]*:\s*.+/;
    const yamlListPattern = /^\s*-\s+.+/;
    const nestedKeyPattern = /^\s{2,}[\w][\w.-]*:\s*.+/;
    let kvCount = 0;
    let structureCount = 0;
    for (const line of nonEmptyLines) {
      if (kvPattern.test(line)) kvCount++;
      if (yamlListPattern.test(line) || nestedKeyPattern.test(line)) structureCount++;
    }

    const kvRatio = kvCount / nonEmptyLines.length;

    if (kvCount >= 3 && kvRatio >= 0.4) return true;
    if (kvCount >= 2 && structureCount >= 1) return true;
    if (kvCount >= 2 && kvRatio >= 0.8) return true;

    return false;
  }

  async parse(buffer: Buffer): Promise<any> {
    return parseYAML(buffer);
  }
}

export function parseYAML(buffer: Buffer | string): any {
  const content = typeof buffer === "string" ? buffer : buffer.toString("utf8");
  return yaml.load(content);
}
