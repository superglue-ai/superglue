import { FilterAction, FilterTarget, ResponseFilter } from "@superglue/shared";

export interface FilterMatch {
  filterId: string;
  filterName?: string;
  action: FilterAction;
  path: string;
  matchedOn: "key" | "value";
  matchedValue?: string;
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

/**
 * Apply response filters to data, recursively processing objects and arrays.
 * Returns filtered data and information about what was matched.
 */
export function applyResponseFilters(data: any, filters: ResponseFilter[]): ApplyFiltersResult {
  const enabledFilters = filters.filter((f) => f.enabled);
  if (enabledFilters.length === 0) {
    return { data, matches: [], failedFilters: [] };
  }

  const matches: FilterMatch[] = [];
  const failedFilters: FilterMatch[] = [];

  const processedData = processValue(data, enabledFilters, "", matches, failedFilters);

  return {
    data: processedData,
    matches,
    failedFilters,
  };
}

function processValue(
  value: any,
  filters: ResponseFilter[],
  path: string,
  matches: FilterMatch[],
  failedFilters: FilterMatch[],
): any {
  if (value === null || value === undefined) {
    return value;
  }

  if (Array.isArray(value)) {
    return value
      .map((item, index) =>
        processValue(item, filters, `${path}[${index}]`, matches, failedFilters),
      )
      .filter((item) => item !== undefined);
  }

  if (typeof value === "object") {
    return processObject(value, filters, path, matches, failedFilters);
  }

  // For primitive values at root level, check value filters
  if (typeof value === "string") {
    for (const filter of filters) {
      if (filter.target === FilterTarget.VALUES || filter.target === FilterTarget.BOTH) {
        if (matchesPattern(value, filter.pattern)) {
          const match: FilterMatch = {
            filterId: filter.id,
            filterName: filter.name,
            action: filter.action,
            path: path || "(root)",
            matchedOn: "value",
          };
          matches.push(match);

          if (filter.action === FilterAction.FAIL) {
            failedFilters.push(match);
          }
          // For REMOVE/MASK on root primitive, we can't remove/mask in place
          // The caller would need to handle this
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
  matches: FilterMatch[],
  failedFilters: FilterMatch[],
): Record<string, any> {
  const result: Record<string, any> = {};

  for (const [key, value] of Object.entries(obj)) {
    const currentPath = path ? `${path}.${key}` : key;
    let shouldRemove = false;
    let shouldMask = false;
    let maskValue = "[filtered]";

    // Check key filters
    for (const filter of filters) {
      if (filter.target === FilterTarget.KEYS || filter.target === FilterTarget.BOTH) {
        if (matchesPattern(key, filter.pattern)) {
          const match: FilterMatch = {
            filterId: filter.id,
            filterName: filter.name,
            action: filter.action,
            path: currentPath,
            matchedOn: "key",
          };
          matches.push(match);

          if (filter.action === FilterAction.FAIL) {
            failedFilters.push(match);
          } else if (filter.action === FilterAction.REMOVE) {
            shouldRemove = true;
          } else if (filter.action === FilterAction.MASK) {
            shouldMask = true;
            maskValue = filter.maskValue ?? "[filtered]";
          }
        }
      }
    }

    // Check value filters (only for string values)
    if (typeof value === "string" && !shouldRemove) {
      for (const filter of filters) {
        if (filter.target === FilterTarget.VALUES || filter.target === FilterTarget.BOTH) {
          if (matchesPattern(value, filter.pattern)) {
            const match: FilterMatch = {
              filterId: filter.id,
              filterName: filter.name,
              action: filter.action,
              path: currentPath,
              matchedOn: "value",
            };
            matches.push(match);

            if (filter.action === FilterAction.FAIL) {
              failedFilters.push(match);
            } else if (filter.action === FilterAction.REMOVE) {
              shouldRemove = true;
            } else if (filter.action === FilterAction.MASK) {
              shouldMask = true;
              maskValue = filter.maskValue ?? "[FILTERED]";
            }
          }
        }
      }
    }

    if (shouldRemove) {
      // Skip this key entirely
      continue;
    }

    if (shouldMask) {
      result[key] = maskValue;
    } else {
      // Recursively process nested values
      result[key] = processValue(value, filters, currentPath, matches, failedFilters);
    }
  }

  return result;
}

function matchesPattern(value: string, pattern: string): boolean {
  try {
    const regex = new RegExp(pattern, "i"); // Case insensitive by default
    return regex.test(value);
  } catch {
    // Invalid regex - treat as literal match
    return value.toLowerCase().includes(pattern.toLowerCase());
  }
}
