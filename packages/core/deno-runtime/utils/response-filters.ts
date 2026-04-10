/**
 * Response filters for Deno runtime
 *
 * Applies filters to mask, remove, or fail on sensitive data patterns.
 */

export enum FilterTarget {
  KEYS = "KEYS",
  VALUES = "VALUES",
  BOTH = "BOTH",
}

export enum FilterAction {
  REMOVE = "REMOVE",
  MASK = "MASK",
  FAIL = "FAIL",
}

export enum RemoveScope {
  FIELD = "FIELD",
  ITEM = "ITEM",
  ENTRY = "ENTRY",
}

export interface ResponseFilter {
  id: string;
  name?: string;
  enabled: boolean;
  target: FilterTarget;
  pattern: string;
  action: FilterAction;
  maskValue?: string;
  scope?: RemoveScope;
}

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
  data: unknown;
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
const REMOVE_FIELD = Symbol("REMOVE_FIELD");
const REMOVE_ITEM = Symbol("REMOVE_ITEM");
const REMOVE_ENTRY = Symbol("REMOVE_ENTRY");
const MASK_ITEM = Symbol("MASK_ITEM");
const MASK_ENTRY = Symbol("MASK_ENTRY");

type ActionSignal =
  | typeof REMOVE_FIELD
  | typeof REMOVE_ITEM
  | typeof REMOVE_ENTRY
  | typeof MASK_ITEM
  | typeof MASK_ENTRY;

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
export function applyResponseFilters(data: unknown, filters: ResponseFilter[]): ApplyFiltersResult {
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
  value: unknown,
  filters: ResponseFilter[],
  path: string,
  context: ProcessContext,
): unknown | ActionSignal {
  if (value === null || value === undefined) {
    return value;
  }

  if (Array.isArray(value)) {
    const results: unknown[] = [];

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
      if (result === REMOVE_FIELD) {
        continue; // FIELD removal on primitive array element - skip it
      }
      if (result !== undefined) {
        results.push(result);
      }
    }
    return results;
  }

  if (typeof value === "object") {
    return processObject(value as Record<string, unknown>, filters, path, context);
  }

  // For primitive values, check ALL filters first, then decide action
  const stringValue = typeof value === "string" ? value : String(value);
  let actionToTake: { action: FilterAction; scope: RemoveScope; maskValue: string } | null = null;

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
          // Continue checking other filters to collect all failures
        } else if (!actionToTake) {
          // Only take the first REMOVE/MASK action
          actionToTake = {
            action: filter.action,
            scope,
            maskValue: filter.maskValue || "[filtered]",
          };
        }
      }
    }
  }

  // Apply the action (FAIL filters are already collected in failedFilters)
  if (actionToTake) {
    if (actionToTake.action === FilterAction.REMOVE) {
      if (actionToTake.scope === RemoveScope.ENTRY) return REMOVE_ENTRY;
      if (actionToTake.scope === RemoveScope.ITEM) return REMOVE_ITEM;
      return REMOVE_FIELD;
    } else if (actionToTake.action === FilterAction.MASK) {
      context.currentMaskValue = actionToTake.maskValue;
      if (actionToTake.scope === RemoveScope.ENTRY) return MASK_ENTRY;
      if (actionToTake.scope === RemoveScope.ITEM) return MASK_ITEM;
      if (typeof value === "string") {
        // Find the filter to get the pattern for replacement
        const maskFilter = filters.find(
          (f) =>
            f.action === FilterAction.MASK &&
            (f.target === FilterTarget.VALUES || f.target === FilterTarget.BOTH) &&
            matchesPattern(stringValue, f.pattern),
        );
        if (maskFilter) {
          return replacePattern(value, maskFilter.pattern, actionToTake.maskValue);
        }
      }
      return actionToTake.maskValue;
    }
  }

  return value;
}

function processObject(
  obj: Record<string, unknown>,
  filters: ResponseFilter[],
  path: string,
  context: ProcessContext,
): Record<string, unknown> | ActionSignal {
  const result: Record<string, unknown> = {};

  for (const [key, value] of Object.entries(obj)) {
    const currentPath = path ? `${path}.${key}` : key;
    let shouldRemoveField = false;
    let shouldMask = false;
    let maskValue = "[filtered]";
    let earlyReturnSignal: ActionSignal | null = null;

    // Check key filters - collect ALL matches first
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
            // Continue to collect all FAIL matches
          } else if (filter.action === FilterAction.REMOVE && !earlyReturnSignal) {
            if (scope === RemoveScope.ENTRY) earlyReturnSignal = REMOVE_ENTRY;
            else if (scope === RemoveScope.ITEM) earlyReturnSignal = REMOVE_ITEM;
            else shouldRemoveField = true;
          } else if (
            filter.action === FilterAction.MASK &&
            !earlyReturnSignal &&
            !shouldRemoveField
          ) {
            maskValue = filter.maskValue || "[filtered]";
            context.currentMaskValue = maskValue;
            if (scope === RemoveScope.ENTRY) earlyReturnSignal = MASK_ENTRY;
            else if (scope === RemoveScope.ITEM) earlyReturnSignal = MASK_ITEM;
            else shouldMask = true;
          }
        }
      }
    }

    // Check value filters (for primitive values - strings, numbers, booleans)
    const isPrimitive =
      typeof value === "string" || typeof value === "number" || typeof value === "boolean";
    let currentValue = isPrimitive ? String(value) : null;
    let valueWasMasked = false;
    if (currentValue !== null && !shouldRemoveField && !earlyReturnSignal) {
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
              // Continue to collect all FAIL matches
            } else if (filter.action === FilterAction.REMOVE && !earlyReturnSignal) {
              if (scope === RemoveScope.ENTRY) earlyReturnSignal = REMOVE_ENTRY;
              else if (scope === RemoveScope.ITEM) earlyReturnSignal = REMOVE_ITEM;
              else shouldRemoveField = true;
            } else if (
              filter.action === FilterAction.MASK &&
              !earlyReturnSignal &&
              !shouldRemoveField
            ) {
              maskValue = filter.maskValue || "[filtered]";
              context.currentMaskValue = maskValue;
              if (scope === RemoveScope.ENTRY) earlyReturnSignal = MASK_ENTRY;
              else if (scope === RemoveScope.ITEM) earlyReturnSignal = MASK_ITEM;
              else {
                // Partial replacement only works for actual strings
                if (typeof value === "string") {
                  const replacement = filter.maskValue || "[filtered]";
                  currentValue = replacePattern(currentValue, filter.pattern, replacement);
                  valueWasMasked = true;
                }
                shouldMask = true;
              }
            }
          }
        }
      }
      if (valueWasMasked) {
        maskValue = currentValue;
      }
    }

    // Now apply the action - early return signals take precedence
    if (earlyReturnSignal) {
      return earlyReturnSignal;
    }

    if (shouldRemoveField) {
      continue;
    }

    if (shouldMask && maskValue !== null) {
      result[key] = maskValue;
    } else if (typeof value === "object" && value !== null) {
      // Only recursively process objects and arrays (not primitives)
      const processed = processValue(value, filters, currentPath, context);

      // Bubble up signals from nested values
      if (
        processed === REMOVE_ENTRY ||
        processed === REMOVE_ITEM ||
        processed === MASK_ENTRY ||
        processed === MASK_ITEM
      ) {
        return processed as ActionSignal;
      }

      // REMOVE_FIELD from a nested primitive means skip this key
      if (processed === REMOVE_FIELD) {
        continue;
      }

      result[key] = processed;
    } else {
      // Primitives: keep as-is (already processed above for value filters)
      result[key] = value;
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
