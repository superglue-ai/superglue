/**
 * JSON Schema validation for Deno runtime
 *
 * Validates data against JSON Schema with support for nullable optional fields.
 */

import Ajv from "npm:ajv@8";
import addFormats from "npm:ajv-formats@3";

// deno-lint-ignore no-explicit-any
type JSONSchema = any;

export interface ValidationResult {
  success: boolean;
  data?: unknown;
  error?: string;
}

/**
 * Add nullable type to optional properties in a schema
 * This makes validation more lenient for optional fields
 */
export function addNullableToOptional(schema: JSONSchema, required = true): JSONSchema {
  if (!schema || typeof schema !== "object") return schema;

  const newSchema = { ...schema };

  // Add null to type for non-required fields
  if (!required && schema.required !== true && Array.isArray(schema.type)) {
    if (!schema.type.includes("null")) {
      newSchema.type = [...schema.type, "null"];
    }
  } else if (!required && schema.required !== true && schema.type) {
    newSchema.type = [schema.type, "null"];
  }

  // Process $defs
  if (schema?.$defs) {
    newSchema.$defs = Object.entries(schema.$defs).reduce(
      (acc, [key, value]) => ({
        ...acc,
        [key]: addNullableToOptional(value, required),
      }),
      {},
    );
  }

  // Process oneOf
  if (schema.oneOf) {
    newSchema.oneOf = schema.oneOf.map((item: JSONSchema) => addNullableToOptional(item, required));
  }

  // Process anyOf
  if (schema.anyOf) {
    newSchema.anyOf = schema.anyOf.map((item: JSONSchema) => addNullableToOptional(item, required));
  }

  // Process allOf
  if (schema.allOf) {
    newSchema.allOf = schema.allOf.map((item: JSONSchema) => addNullableToOptional(item, required));
  }

  // Process object properties
  if ((schema.type === "object" || schema.type?.includes("object")) && schema.properties) {
    if (!("additionalProperties" in schema)) {
      newSchema.additionalProperties = true;
    }
    const allRequired = new Set(Array.isArray(schema.required) ? schema.required : []);
    newSchema.required = Array.from(allRequired);
    newSchema.properties = Object.entries(schema.properties).reduce(
      (acc, [key, value]) => ({
        ...acc,
        [key]: addNullableToOptional(value, allRequired.has(key)),
      }),
      {},
    );
  }

  // Process array items
  if ((schema.type === "array" || schema.type?.includes("array")) && schema.items) {
    newSchema.items = addNullableToOptional(schema.items, required);
  }

  return newSchema;
}

/**
 * Validate data against a JSON Schema
 */
export function validateSchema(data: unknown, schema: JSONSchema): ValidationResult {
  if (!schema) {
    return { success: true, data };
  }

  try {
    // Use default export for Ajv
    const AjvClass = Ajv.default || Ajv;
    const ajv = new AjvClass({ allErrors: true, strict: false });

    // Use default export for addFormats
    const addFormatsFunc = addFormats.default || addFormats;
    addFormatsFunc(ajv);

    const optionalSchema = addNullableToOptional(schema);
    const validate = ajv.compile(optionalSchema);
    const valid = validate(data);

    if (!valid) {
      const errors = validate.errors || [];
      const errorMessages = errors
        .map((e: { instancePath?: string; message?: string }) => {
          const path = e.instancePath || "(root)";
          const message = e.message || "validation failed";
          return `${path}: ${message}`;
        })
        .join("\n");

      return {
        success: false,
        error:
          errorMessages.slice(0, 1000) + `\n\nExpected schema: ${JSON.stringify(optionalSchema)}`,
      };
    }

    return { success: true, data };
  } catch (error) {
    return {
      success: false,
      error: `Schema validation error: ${(error as Error).message}`,
    };
  }
}
