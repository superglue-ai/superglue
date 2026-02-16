import { findTemplateForSystem, System } from "@superglue/shared";
import { logMessage } from "../utils/logs.js";
import {
  buildFullObjectSection,
  buildPreviewSection,
  buildSamplesSection,
  buildSchemaSection,
  stringifyWithLimits,
} from "./context-helpers.js";
import {
  SystemContextOptions,
  ObjectContextOptions,
  ToolBuilderContextInput,
  ToolBuilderContextOptions,
} from "./context-types.js";
import { server_defaults } from "../default.js";

export function getObjectContext(obj: any, opts: ObjectContextOptions): string {
  if (
    opts.include?.schema === false &&
    opts.include?.preview === false &&
    opts.include?.samples === false
  )
    return "";

  const previewDepthLimit =
    opts.tuning?.previewDepthLimit ?? server_defaults.CONTEXT.JSON_PREVIEW_DEPTH_LIMIT;
  const previewArrayLimit =
    opts.tuning?.previewArrayLimit ?? server_defaults.CONTEXT.JSON_PREVIEW_ARRAY_LIMIT;
  const previewObjectKeyLimit =
    opts.tuning?.previewObjectKeyLimit ?? server_defaults.CONTEXT.JSON_PREVIEW_OBJECT_KEY_LIMIT;
  const samplesMaxArrayPaths =
    opts.tuning?.samplesMaxArrayPaths ?? server_defaults.CONTEXT.JSON_SAMPLES_MAX_ARRAY_PATHS;
  const samplesItemsPerArray =
    opts.tuning?.samplesItemsPerArray ?? server_defaults.CONTEXT.JSON_SAMPLES_ITEMS_PER_ARRAY;
  const sampleObjectMaxDepth =
    opts.tuning?.sampleObjectMaxDepth ?? server_defaults.CONTEXT.JSON_SAMPLE_OBJECT_MAX_DEPTH;
  const includeSchema = opts.include?.schema !== false;
  const includePreview = opts.include?.preview !== false;
  const includeSamples = opts.include?.samples !== false;
  const enabledParts: Array<"schema" | "preview" | "samples"> = [];
  if (includeSchema) enabledParts.push("schema");
  if (includePreview) enabledParts.push("preview");
  if (includeSamples) enabledParts.push("samples");
  if (enabledParts.length === 0) return "";

  const budget = Math.max(0, opts.characterBudget | 0);
  if (budget === 0) return "";

  let perShare = Math.floor(budget / enabledParts.length);
  let remainingCarry = 0;
  const sections: string[] = [];

  // if the full object fits in the budget (including wrapper tags), return it directly
  const fullJson = stringifyWithLimits(obj, Infinity, Infinity, Infinity, false);
  const fullObjectWrapperOverhead = "<full_object>\n".length + "</full_object>".length; // 28 chars
  if (fullJson.length + fullObjectWrapperOverhead <= budget) {
    return buildFullObjectSection(fullJson);
  }

  if (includeSchema) {
    const share = perShare + remainingCarry;
    const schemaStr = buildSchemaSection(obj, share);
    sections.push(schemaStr.text);
    remainingCarry = Math.max(0, share - schemaStr.text.length);
  }

  if (includePreview) {
    const share = perShare + remainingCarry;
    const previewStr = buildPreviewSection(
      obj,
      share,
      previewDepthLimit,
      previewArrayLimit,
      previewObjectKeyLimit,
    );
    sections.push(previewStr.text);
    remainingCarry = Math.max(0, share - previewStr.text.length);
  }

  if (includeSamples) {
    const share = perShare + remainingCarry;
    const samplesStr = buildSamplesSection(
      obj,
      share,
      previewDepthLimit,
      previewArrayLimit,
      previewObjectKeyLimit,
      samplesMaxArrayPaths,
      samplesItemsPerArray,
      sampleObjectMaxDepth,
    );
    sections.push(samplesStr.text);
  }

  const combined = sections.filter(Boolean).join("\n\n");
  return combined.slice(0, budget);
}

export function buildSystemContext(system: System, opts: SystemContextOptions): string {
  const budget = Math.max(0, opts.characterBudget | 0);
  if (budget === 0) return "";

  // Look up template for additional context
  const templateMatch = findTemplateForSystem(system);
  const template = templateMatch?.template;

  const xml_opening_tag = `<${system.id}>`;
  const urlSection = "<base_url>" + (system.url || "") + "</base_url>";

  const specificInstructionsSection =
    "<system_specific_instructions>" +
    (system.specificInstructions?.length > 0
      ? system.specificInstructions
      : "No system-specific instructions provided.") +
    "</system_specific_instructions>";

  // Build template section with all template info
  let templateSection = "";
  if (template) {
    const templateParts: string[] = [];
    if (template.apiUrl) templateParts.push(`<api_url>${template.apiUrl}</api_url>`);
    if (template.docsUrl) templateParts.push(`<docs_url>${template.docsUrl}</docs_url>`);
    if (template.preferredAuthType)
      templateParts.push(
        `<preferred_auth_type>${template.preferredAuthType}</preferred_auth_type>`,
      );
    if (template.systemSpecificInstructions)
      templateParts.push(
        `<template_instructions>${template.systemSpecificInstructions}</template_instructions>`,
      );
    if (templateParts.length > 0) {
      templateSection = `<base_template>${templateParts.join("")}</base_template>`;
    }
  }

  const xml_closing_tag = `</${system.id}>`;
  const newlineCount = 2;
  const availableBudget = budget - xml_opening_tag.length - xml_closing_tag.length - newlineCount;
  return (
    xml_opening_tag +
    "\n" +
    [urlSection, specificInstructionsSection, templateSection]
      .filter(Boolean)
      .join("\n")
      .slice(0, availableBudget) +
    "\n" +
    xml_closing_tag
  );
}

function buildAvailableVariableContext(payload: any, systems: System[]): string {
  const availableVariables = [
    ...systems.flatMap((int) =>
      Object.keys(int.credentials || {}).map((k) => `<<${int.id}_${k}>>`),
    ),
    ...Object.keys(payload || {}).map((k) => `<<${k}>>`),
  ].join(", ");

  return availableVariables || "No variables available";
}

export function getToolBuilderContext(
  input: ToolBuilderContextInput,
  options: ToolBuilderContextOptions,
): string {
  const budget = Math.max(0, options.characterBudget | 0);
  if (budget === 0) return "";
  const hasSystems = input.systems.length > 0;

  const prompt_start = `Build a complete workflow to fulfill the user's instruction.`;
  const prompt_end = hasSystems
    ? "Ensure that the final output matches the instruction and you use ONLY the available system ids."
    : "Since no systems are available, create a transform-only workflow with no steps, using only the finalTransform to process the payload data.";
  const userInstructionContext = options.include.userInstruction
    ? `<instruction>${input.userInstruction}</instruction>`
    : "";

  const availableVariablesContent = buildAvailableVariableContext(input.payload, input.systems);
  const perSystemBudget = hasSystems ? Math.floor(budget / input.systems.length) : 0;
  const systemContent = hasSystems
    ? input.systems
        .map((int) =>
          buildSystemContext(int, { characterBudget: perSystemBudget, metadata: input.metadata }),
        )
        .join("\n")
    : "No systems provided. Please provide systems to build a workflow.";

  const availableVariablesContext = options.include?.availableVariablesContext
    ? `<available_variables>${availableVariablesContent}</available_variables>`
    : "";
  const payloadContext = options.include?.payloadContext
    ? `<workflow_input>${getObjectContext(input.payload, { include: { schema: true, preview: false, samples: true }, characterBudget: Math.floor(budget * 0.2) })}</workflow_input>`
    : "";
  const systemContext = options.include?.systemContext
    ? `<available_systems_and_documentation>${systemContent}</available_systems_and_documentation>`
    : "";

  return (
    prompt_start +
    "\n" +
    userInstructionContext +
    "\n" +
    systemContext +
    "\n" +
    availableVariablesContext +
    "\n" +
    payloadContext +
    "\n" +
    prompt_end
  );
}
