import { FilterAction, FilterTarget, RemoveScope, ResponseFilter } from "@superglue/shared";

export interface FilterMatch {
  filterId: string;
  filterName?: string;
  action: FilterAction;
  path: string;
  matchedOn: "key" | "value";
  matchedValue?: string;
  scope?: RemoveScope;
}

export interface ApplyFiltersResult {
  data: any;
  matches: FilterMatch[];
  failedFilters: FilterMatch[];
}

export class FilterMatchError extends Error {
  constructor(public matches: FilterMatch[]) {
    const details = matches
      .map((m) => `Filter "${m.filterName || m.filterId}" matched at "${m.path}"`)
      .join("; ");
    super(`Output filter validation failed: ${details}`);
    this.name = "FilterMatchError";
  }
}

// Sentinels to signal actions at ancestor level
const REMOVE_ITEM = Symbol("REMOVE_ITEM");
const REMOVE_ENTRY = Symbol("REMOVE_ENTRY");
const MASK_ITEM = Symbol("MASK_ITEM");
const MASK_ENTRY = Symbol("MASK_ENTRY");

type ActionSignal = typeof REMOVE_ITEM | typeof REMOVE_ENTRY | typeof MASK_ITEM | typeof MASK_ENTRY;

interface ProcessContext {
  matches: FilterMatch[];
  failedFilters: FilterMatch[];
  entryPath: string | null;
  currentMaskValue: string;
}

/**
 * Apply response filters to data, recursively processing objects and arrays.
 * Returns filtered data and information about what was matched.
 *
 * Scope behavior for REMOVE:
 * - FIELD (default): Remove only the matched key-value pair
 * - ITEM: Remove from the nearest containing array
 * - ENTRY: Remove from the top-level array
 *
 * Scope behavior for MASK:
 * - FIELD (default): Mask only the matched value
 * - ITEM: Replace the entire containing object with mask value
 * - ENTRY: Replace the entire top-level array item with mask value
 */
export function applyResponseFilters(data: any, filters: ResponseFilter[]): ApplyFiltersResult {
  const enabledFilters = filters.filter((f) => f.enabled);
  if (enabledFilters.length === 0) {
    return { data, matches: [], failedFilters: [] };
  }

  const context: ProcessContext = {
    matches: [],
    failedFilters: [],
    entryPath: null,
    currentMaskValue: "[filtered]",
  };

  let processedData = processValue(data, enabledFilters, "", context);

  // Handle signals at root level
  if (processedData === REMOVE_ITEM || processedData === REMOVE_ENTRY) {
    processedData = Array.isArray(data) ? [] : {};
  } else if (processedData === MASK_ITEM || processedData === MASK_ENTRY) {
    processedData = context.currentMaskValue;
  }

  return {
    data: processedData,
    matches: context.matches,
    failedFilters: context.failedFilters,
  };
}

function processValue(
  value: any,
  filters: ResponseFilter[],
  path: string,
  context: ProcessContext,
): any {
  if (value === null || value === undefined) {
    return value;
  }

  if (Array.isArray(value)) {
    const results: any[] = [];

    for (let index = 0; index < value.length; index++) {
      const itemPath = `${path}[${index}]`;
      const previousEntryPath = context.entryPath;

      // Track entry path - first array item we enter
      if (context.entryPath === null) {
        context.entryPath = itemPath;
      }

      const result = processValue(value[index], filters, itemPath, context);

      context.entryPath = previousEntryPath;

      // Handle signals at array level
      if (result === REMOVE_ENTRY) {
        if (previousEntryPath === null) {
          continue; // At entry level, skip this item
        }
        return REMOVE_ENTRY; // Bubble up
      }
      if (result === REMOVE_ITEM) {
        continue; // Remove from this array
      }
      if (result === MASK_ENTRY) {
        if (previousEntryPath === null) {
          results.push(context.currentMaskValue); // Replace with mask at entry level
          continue;
        }
        return MASK_ENTRY; // Bubble up
      }
      if (result === MASK_ITEM) {
        results.push(context.currentMaskValue); // Replace with mask at this level
        continue;
      }
      if (result !== undefined) {
        results.push(result);
      }
    }
    return results;
  }

  if (typeof value === "object") {
    return processObject(value, filters, path, context);
  }

  // For primitive values, check value filters
  const stringValue = typeof value === "string" ? value : String(value);
  for (const filter of filters) {
    if (filter.target === FilterTarget.VALUES || filter.target === FilterTarget.BOTH) {
      if (matchesPattern(stringValue, filter.pattern)) {
        const scope = filter.scope || RemoveScope.FIELD;
        const match: FilterMatch = {
          filterId: filter.id,
          filterName: filter.name,
          action: filter.action,
          path: path || "(root)",
          matchedOn: "value",
          scope: scope,
        };
        context.matches.push(match);

        if (filter.action === FilterAction.FAIL) {
          context.failedFilters.push(match);
        } else if (filter.action === FilterAction.REMOVE) {
          // For primitives in arrays, ITEM scope removes this element
          if (scope === RemoveScope.ENTRY) return REMOVE_ENTRY;
          if (scope === RemoveScope.ITEM) return REMOVE_ITEM;
          // FIELD scope on a primitive = remove the primitive itself
          return undefined;
        } else if (filter.action === FilterAction.MASK) {
          const maskValue = filter.maskValue || "[filtered]";
          context.currentMaskValue = maskValue;
          if (scope === RemoveScope.ENTRY) return MASK_ENTRY;
          if (scope === RemoveScope.ITEM) return MASK_ITEM;
          // FIELD scope on a primitive = mask the value directly
          if (typeof value === "string") {
            return replacePattern(value, filter.pattern, maskValue);
          }
          return maskValue;
        }
      }
    }
  }

  return value;
}

function processObject(
  obj: Record<string, any>,
  filters: ResponseFilter[],
  path: string,
  context: ProcessContext,
): Record<string, any> | ActionSignal {
  const result: Record<string, any> = {};

  for (const [key, value] of Object.entries(obj)) {
    const currentPath = path ? `${path}.${key}` : key;
    let shouldRemoveField = false;
    let shouldMask = false;
    let maskValue = "[filtered]";

    // Check key filters
    for (const filter of filters) {
      if (filter.target === FilterTarget.KEYS || filter.target === FilterTarget.BOTH) {
        if (matchesPattern(key, filter.pattern)) {
          const scope = filter.scope ?? RemoveScope.FIELD;
          const match: FilterMatch = {
            filterId: filter.id,
            filterName: filter.name,
            action: filter.action,
            path: currentPath,
            matchedOn: "key",
            scope: scope,
          };
          context.matches.push(match);

          if (filter.action === FilterAction.FAIL) {
            context.failedFilters.push(match);
          } else if (filter.action === FilterAction.REMOVE) {
            if (scope === RemoveScope.ENTRY) return REMOVE_ENTRY;
            if (scope === RemoveScope.ITEM) return REMOVE_ITEM;
            shouldRemoveField = true;
          } else if (filter.action === FilterAction.MASK) {
            maskValue = filter.maskValue || "[filtered]";
            context.currentMaskValue = maskValue;
            if (scope === RemoveScope.ENTRY) return MASK_ENTRY;
            if (scope === RemoveScope.ITEM) return MASK_ITEM;
            shouldMask = true;
          }
        }
      }
    }

    // Check value filters (for string values)
    let currentValue = typeof value === "string" ? value : null;
    let valueWasMasked = false;
    if (currentValue && !shouldRemoveField) {
      for (const filter of filters) {
        if (filter.target === FilterTarget.VALUES || filter.target === FilterTarget.BOTH) {
          if (matchesPattern(currentValue, filter.pattern)) {
            const scope = filter.scope ?? RemoveScope.FIELD;
            const match: FilterMatch = {
              filterId: filter.id,
              filterName: filter.name,
              action: filter.action,
              path: currentPath,
              matchedOn: "value",
              scope: scope,
            };
            context.matches.push(match);

            if (filter.action === FilterAction.FAIL) {
              context.failedFilters.push(match);
            } else if (filter.action === FilterAction.REMOVE) {
              if (scope === RemoveScope.ENTRY) return REMOVE_ENTRY;
              if (scope === RemoveScope.ITEM) return REMOVE_ITEM;
              shouldRemoveField = true;
            } else if (filter.action === FilterAction.MASK) {
              maskValue = filter.maskValue || "[filtered]";
              context.currentMaskValue = maskValue;
              if (scope === RemoveScope.ENTRY) return MASK_ENTRY;
              if (scope === RemoveScope.ITEM) return MASK_ITEM;
              const replacement = filter.maskValue || "[filtered]";
              currentValue = replacePattern(currentValue, filter.pattern, replacement);
              shouldMask = true;
              valueWasMasked = true;
            }
          }
        }
      }
      if (valueWasMasked) {
        maskValue = currentValue;
      }
    }

    if (shouldRemoveField) {
      continue;
    }

    if (shouldMask && maskValue !== null) {
      result[key] = maskValue;
    } else {
      // Recursively process nested values
      const processed = processValue(value, filters, currentPath, context);

      // Bubble up signals from nested values
      if (
        processed === REMOVE_ENTRY ||
        processed === REMOVE_ITEM ||
        processed === MASK_ENTRY ||
        processed === MASK_ITEM
      ) {
        return processed;
      }

      result[key] = processed;
    }
  }

  return result;
}

function matchesPattern(value: string, pattern: string): boolean {
  try {
    const regex = new RegExp(pattern, "i");
    return regex.test(value);
  } catch {
    return value.toLowerCase().includes(pattern.toLowerCase());
  }
}

function replacePattern(value: string, pattern: string, replacement: string): string {
  try {
    const regex = new RegExp(pattern, "gi");
    return value.replace(regex, replacement);
  } catch {
    const escapedPattern = pattern.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    return value.replace(new RegExp(escapedPattern, "gi"), replacement);
  }
}
