import { Metrics } from "./types.js";
import { writeFileSync, existsSync, readFileSync } from "fs";
import { Metadata } from "@superglue/shared";
import { logMessage } from "../../utils/logs.js";

export type JsonReport = {
  timestamp: string;
  metrics: Metrics;
}

export class JsonReporter {
  constructor(
    private outputPath: string,
    private metadata: Metadata
  ) {
  }

  public report(metrics: Metrics): void {
    const timestamp = new Date().toISOString();

    const result: JsonReport = { timestamp, metrics };

    let results: JsonReport[] = [];
    if (existsSync(this.outputPath)) {
      try {
        const fileContent = readFileSync(this.outputPath, "utf-8");
        const parsed = JSON.parse(fileContent);
        if (Array.isArray(parsed)) {
          results = parsed;
        }
      } catch {
        results = []; // overwrite on parse failure
      }
    }

    results.push(result);
    writeFileSync(this.outputPath, JSON.stringify(results, null, 2), "utf-8");

    const msg = results.length === 1 ? `JSON report created: ${this.outputPath}` : `JSON report updated: ${this.outputPath} (${results.length} runs)`;
    logMessage("info", msg, this.metadata);
  }

  public getLatestReport(): JsonReport | undefined {
    if (!existsSync(this.outputPath)) {
      return undefined;
    }

    const fileContent = readFileSync(this.outputPath, "utf-8");
    try {
      const results = JSON.parse(fileContent);
      if (!Array.isArray(results)) return undefined;
      return results[results.length - 1];
    } catch (error) {
      logMessage("error", `Failed to parse JSON report: ${error}`, this.metadata);
      return undefined;
    }
  }
}

