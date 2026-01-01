import { SupportedFileType } from "@superglue/shared";
import sax from "sax";
import { Readable } from "stream";
import { DetectionPriority, FileParsingStrategy } from "../strategy.js";

export class XMLStrategy implements FileParsingStrategy {
  readonly fileType = SupportedFileType.XML;
  readonly priority = DetectionPriority.STRUCTURED_TEXT;

  canHandle(buffer: Buffer): boolean {
    try {
      const sampleSize = Math.min(buffer.length, 4096);
      const sample = buffer.subarray(0, sampleSize).toString("utf8").trim();

      if (!sample.startsWith("<?xml") && !sample.startsWith("<")) {
        return false;
      }

      return sample.includes("</") || sample.includes("/>");
    } catch {
      return false;
    }
  }

  async parse(buffer: Buffer): Promise<any> {
    return parseXML(buffer);
  }
}

export async function parseXML(buffer: Buffer): Promise<any> {
  const results: any = {};
  let currentElement: any = null;
  const elementStack: any[] = [];
  return new Promise((resolve, reject) => {
    const parser = sax.createStream(false);

    parser.on("opentag", (node) => {
      const newElement: any = node.attributes || {};
      if (currentElement && typeof currentElement === "object") {
        elementStack.push(currentElement);
      } else if (currentElement && typeof currentElement === "string") {
        elementStack.push({ _TEXT: currentElement });
      } else {
        elementStack.push({});
      }

      currentElement = newElement;
    });

    parser.on("text", (text) => {
      if (!currentElement || text?.trim()?.length == 0) {
        return;
      }
      if (
        typeof currentElement !== "object" ||
        currentElement === null ||
        Array.isArray(currentElement)
      ) {
        return;
      }

      if (Object.keys(currentElement)?.length > 0) {
        currentElement["_TEXT"] = text.trim();
      } else if (Array.isArray(currentElement)) {
        currentElement.push(text.trim());
      } else if (typeof currentElement === "string") {
        currentElement = [currentElement, text.trim()];
      } else {
        currentElement = text.trim();
      }
    });

    parser.on("closetag", (tagName) => {
      let parentElement = elementStack.pop();
      if (parentElement == null) {
        parentElement = results;
      }
      if (currentElement) {
        if (!parentElement[tagName]) {
          parentElement[tagName] = currentElement;
        } else if (Array.isArray(parentElement[tagName])) {
          parentElement[tagName].push(currentElement);
        } else {
          parentElement[tagName] = [parentElement[tagName], currentElement];
        }
      }
      currentElement = parentElement;
    });

    parser.on("error", (err) => {
      console.warn("XML parsing warning (continuing):", err.message);
    });

    parser.on("end", async () => {
      resolve(currentElement);
    });

    const readStream = Readable.from(buffer);
    readStream.pipe(parser);
  });
}
