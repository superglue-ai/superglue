import { JSONContent } from "@tiptap/core";
import { parseTemplateString } from "@/src/lib/templating-utils";

export function templateStringToTiptap(value: string): JSONContent {
  if (!value) {
    return { type: "doc", content: [{ type: "paragraph" }] };
  }

  const parts = parseTemplateString(value);
  const paragraphs: JSONContent[] = [];
  let currentParagraph: JSONContent[] = [];

  for (const part of parts) {
    if (part.type === "text") {
      const textLines = part.value.split("\n");
      for (let i = 0; i < textLines.length; i++) {
        if (textLines[i]) {
          currentParagraph.push({ type: "text", text: textLines[i] });
        }
        if (i < textLines.length - 1) {
          paragraphs.push({
            type: "paragraph",
            content: currentParagraph.length > 0 ? currentParagraph : undefined,
          });
          currentParagraph = [];
        }
      }
    } else if (part.type === "template") {
      currentParagraph.push({
        type: "template",
        attrs: { rawTemplate: part.rawTemplate },
      });
    }
  }

  paragraphs.push({
    type: "paragraph",
    content: currentParagraph.length > 0 ? currentParagraph : undefined,
  });

  return { type: "doc", content: paragraphs };
}

export function tiptapToTemplateString(json: JSONContent): string {
  if (!json?.content) return "";

  const lines: string[] = [];
  for (const paragraph of json.content) {
    if (paragraph.type === "paragraph") {
      let line = "";
      if (paragraph.content) {
        for (const node of paragraph.content) {
          if (node.type === "text") line += node.text || "";
          else if (node.type === "template") line += node.attrs?.rawTemplate || "";
          else if (node.type === "hardBreak") line += "\n";
        }
      }
      lines.push(line);
    }
  }
  return lines.join("\n");
}
