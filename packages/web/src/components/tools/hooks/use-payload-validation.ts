import { useState, useEffect, useRef, useMemo } from "react";
import { Validator } from "jsonschema";
import isEqual from "lodash.isequal";
import { generateDefaultFromSchema } from "@superglue/shared";

interface UsePayloadValidationOptions {
  computedPayload: Record<string, any>;
  inputSchema: string | null;
  hasUserEdited: boolean;
  debounceMs?: number;
}

interface UsePayloadValidationReturn {
  isValid: boolean;
  isValidating: boolean;
}

function extractPayloadSchema(fullInputSchema: string | null): any | null {
  if (!fullInputSchema || fullInputSchema.trim() === "") {
    return null;
  }
  try {
    const parsed = JSON.parse(fullInputSchema);
    if (parsed && typeof parsed === "object" && parsed.properties && parsed.properties.payload) {
      return parsed.properties.payload;
    }
    return parsed;
  } catch {
    return null;
  }
}

function validatePayload(payload: any, payloadSchema: any | null, userHasEdited: boolean): boolean {
  if (!payloadSchema || Object.keys(payloadSchema).length === 0) {
    return true;
  }

  try {
    const validator = new Validator();
    const result = validator.validate(payload, payloadSchema);

    if (!result.valid) {
      return false;
    }

    if (!userHasEdited) {
      try {
        const generatedDefault = generateDefaultFromSchema(payloadSchema);
        if (Object.keys(generatedDefault).length === 0 && typeof generatedDefault === "object") {
          return true;
        }
        if (isEqual(payload, generatedDefault)) {
          return false;
        }
      } catch {
        // Can't generate default, rely on schema validation
      }
    }

    return true;
  } catch {
    return false;
  }
}

export function usePayloadValidation({
  computedPayload,
  inputSchema,
  hasUserEdited,
  debounceMs = 300,
}: UsePayloadValidationOptions): UsePayloadValidationReturn {
  const [isValid, setIsValid] = useState(true);
  const [isValidating, setIsValidating] = useState(false);
  const timeoutRef = useRef<NodeJS.Timeout | null>(null);

  const payloadSchema = useMemo(() => extractPayloadSchema(inputSchema), [inputSchema]);

  useEffect(() => {
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
    }

    setIsValidating(true);

    timeoutRef.current = setTimeout(() => {
      const valid = validatePayload(computedPayload, payloadSchema, hasUserEdited);
      setIsValid(valid);
      setIsValidating(false);
    }, debounceMs);

    return () => {
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
      }
    };
  }, [computedPayload, payloadSchema, hasUserEdited, debounceMs]);

  return { isValid, isValidating };
}
