import { describe, expect, it } from "vitest";
import { generateDefaultFromSchema } from "@superglue/shared";

describe("generateDefaultFromSchema", () => {
  it("should generate empty string for string type", () => {
    const schema = { type: "string" };
    expect(generateDefaultFromSchema(schema)).toBe("");
  });

  it("should generate 0 for number type", () => {
    const schema = { type: "number" };
    expect(generateDefaultFromSchema(schema)).toBe(0);
  });

  it("should generate 0 for integer type", () => {
    const schema = { type: "integer" };
    expect(generateDefaultFromSchema(schema)).toBe(0);
  });

  it("should generate false for boolean type", () => {
    const schema = { type: "boolean" };
    expect(generateDefaultFromSchema(schema)).toBe(false);
  });

  it("should generate null for null type", () => {
    const schema = { type: "null" };
    expect(generateDefaultFromSchema(schema)).toBe(null);
  });

  it("should generate empty array for array type", () => {
    const schema = { type: "array", items: { type: "string" } };
    expect(generateDefaultFromSchema(schema)).toEqual([]);
  });

  it("should generate object with properties", () => {
    const schema = {
      type: "object",
      properties: {
        name: { type: "string" },
        age: { type: "number" },
        active: { type: "boolean" },
      },
    };
    expect(generateDefaultFromSchema(schema)).toEqual({
      name: "",
      age: 0,
      active: false,
    });
  });

  it("should handle nested objects", () => {
    const schema = {
      type: "object",
      properties: {
        user: {
          type: "object",
          properties: {
            name: { type: "string" },
            email: { type: "string" },
          },
        },
      },
    };
    expect(generateDefaultFromSchema(schema)).toEqual({
      user: {
        name: "",
        email: "",
      },
    });
  });

  it("should use const value when present", () => {
    const schema = { type: "string", const: "fixed-value" };
    expect(generateDefaultFromSchema(schema)).toBe("fixed-value");
  });

  it("should use first enum value when present", () => {
    const schema = { type: "string", enum: ["option1", "option2", "option3"] };
    expect(generateDefaultFromSchema(schema)).toBe("option1");
  });

  it("should use default value when present", () => {
    const schema = { type: "string", default: "default-value" };
    expect(generateDefaultFromSchema(schema)).toBe("default-value");
  });

  it("should handle oneOf by using first option", () => {
    const schema = {
      oneOf: [{ type: "string" }, { type: "number" }],
    };
    expect(generateDefaultFromSchema(schema)).toBe("");
  });

  it("should handle anyOf by using first option", () => {
    const schema = {
      anyOf: [{ type: "number" }, { type: "string" }],
    };
    expect(generateDefaultFromSchema(schema)).toBe(0);
  });

  it("should return null for null schema", () => {
    expect(generateDefaultFromSchema(null)).toBe(null);
  });

  it("should return null for undefined schema", () => {
    expect(generateDefaultFromSchema(undefined)).toBe(null);
  });

  it("should handle schema with no type but with properties", () => {
    const schema = {
      properties: {
        field1: { type: "string" },
        field2: { type: "number" },
      },
    };
    expect(generateDefaultFromSchema(schema)).toEqual({
      field1: "",
      field2: 0,
    });
  });

  it("should handle complex nested schema", () => {
    const schema = {
      type: "object",
      properties: {
        id: { type: "integer" },
        name: { type: "string" },
        tags: { type: "array", items: { type: "string" } },
        metadata: {
          type: "object",
          properties: {
            created: { type: "string" },
            updated: { type: "string" },
          },
        },
      },
    };
    expect(generateDefaultFromSchema(schema)).toEqual({
      id: 0,
      name: "",
      tags: [],
      metadata: {
        created: "",
        updated: "",
      },
    });
  });
});
