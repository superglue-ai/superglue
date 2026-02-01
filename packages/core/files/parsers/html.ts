import { SupportedFileType } from "@superglue/shared";
import * as htmlparser2 from "htmlparser2";
import { DetectionPriority, FileParsingStrategy } from "../strategy.js";

export class HTMLStrategy implements FileParsingStrategy {
  readonly fileType = SupportedFileType.HTML;
  readonly priority = DetectionPriority.STRUCTURED_TEXT;

  canHandle(buffer: Buffer): boolean {
    try {
      const sampleSize = Math.min(buffer.length, 4096);
      const sample = buffer.subarray(0, sampleSize).toString("utf8").trim().toLowerCase();

      // Reject if it starts with XML declaration
      if (sample.startsWith("<?xml")) {
        return false;
      }

      // Strong HTML indicators
      if (sample.includes("<!doctype html")) {
        return true;
      }

      // Check for <html> or <html with attributes (not just "html" anywhere)
      if (sample.match(/<html[\s>]/)) {
        return true;
      }
      return false;
    } catch {
      return false;
    }
  }

  async parse(buffer: Buffer): Promise<any> {
    return parseHTML(buffer);
  }
}

export async function parseHTML(buffer: Buffer): Promise<any> {
  return new Promise((resolve, reject) => {
    const results: any = {};
    const elementStack: any[] = [results];
    let currentPath: string[] = [];

    const parser = new htmlparser2.Parser(
      {
        onopentag(name, attributes) {
          const elementName = attributes.id || name;
          currentPath.push(elementName);
          const parent = elementStack[elementStack.length - 1];

          // Remove id from attributes if it's being used as the element name
          const { id, ...otherAttributes } = attributes;
          const newElement: any = { ...otherAttributes };

          // Add to parent
          if (!parent[elementName]) {
            parent[elementName] = newElement;
          } else if (Array.isArray(parent[elementName])) {
            parent[elementName].push(newElement);
          } else {
            parent[elementName] = [parent[elementName], newElement];
          }

          elementStack.push(newElement);
        },
        ontext(text) {
          const trimmedText = text.trim();
          if (!trimmedText) return;

          const currentElement = elementStack[elementStack.length - 1];
          if (!currentElement) return;

          if (!currentElement.content) {
            currentElement.content = trimmedText;
          } else {
            currentElement.content += " " + trimmedText;
          }
        },
        onclosetag(name) {
          elementStack.pop();
          currentPath.pop();
        },
        onerror(error) {
          console.warn("HTML parsing warning:", error.message);
        },
        onend() {
          resolve(results);
        },
      },
      { decodeEntities: true },
    );

    parser.write(buffer.toString("utf8"));
    parser.end();
  });
}
