// Pagination type mapping from legacy UPPER_CASE to camelCase
export const PAGINATION_TYPE_MAP: Record<string, string> = {
  OFFSET_BASED: "offsetBased",
  PAGE_BASED: "pageBased",
  CURSOR_BASED: "cursorBased",
  DISABLED: "disabled",
};

export function mapPaginationType(internalType?: string): string {
  if (!internalType) return "disabled";
  // If already camelCase, return as-is
  if (PAGINATION_TYPE_MAP[internalType]) {
    return PAGINATION_TYPE_MAP[internalType];
  }
  return internalType;
}

export function mapFailureBehavior(internal?: string): "fail" | "continue" | undefined {
  if (!internal) return undefined;
  return internal.toLowerCase() as "fail" | "continue";
}
