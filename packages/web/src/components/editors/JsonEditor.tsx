"use client";

import React, { createContext, useContext, useMemo, useState } from "react";
import { JsonCodeEditor } from "./JsonCodeEditor";
import { CopyButton } from "../tools/shared/CopyButton";
import { cn, formatLabel } from "@/src/lib/general-utils";
import {
  Table,
  Code,
  ChevronRight,
  ChevronDown,
  X,
  Check,
  Copy,
  Filter,
  Search,
  Download,
  FileJson,
  FileSpreadsheet,
} from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/src/components/ui/dropdown-menu";

const ROWS_PER_PAGE = 25;
const VIEW_PREFERENCE_KEY = "json-editor-view";
const TABLE_VIEW_SIZE_LIMIT = 5 * 1024 * 1024; // 5MB - disable table view for larger content

// Recursively flatten an object, matching how the table view displays data
// Nested objects get dot notation keys, nested arrays get bracket notation
function flattenForCsv(obj: unknown, prefix = ""): Record<string, string> {
  const result: Record<string, string> = {};

  if (obj === null) {
    result[prefix || "value"] = "null";
    return result;
  }

  if (obj === undefined) {
    result[prefix || "value"] = "";
    return result;
  }

  if (typeof obj !== "object") {
    result[prefix || "value"] = String(obj);
    return result;
  }

  if (Array.isArray(obj)) {
    if (obj.length === 0) {
      result[prefix || "value"] = "[]";
      return result;
    }
    // Flatten each array item with index notation
    obj.forEach((item, index) => {
      const itemPrefix = prefix ? `${prefix}[${index}]` : `[${index}]`;
      Object.assign(result, flattenForCsv(item, itemPrefix));
    });
    return result;
  }

  // Object case
  const entries = Object.entries(obj as Record<string, unknown>);
  if (entries.length === 0) {
    result[prefix || "value"] = "{}";
    return result;
  }

  for (const [key, value] of entries) {
    const newKey = prefix ? `${prefix}.${key}` : key;
    Object.assign(result, flattenForCsv(value, newKey));
  }

  return result;
}

// Convert data to CSV - handles arrays of objects as rows, or single objects as key-value pairs
function jsonToCsv(data: unknown): string {
  if (!data || typeof data !== "object") {
    return "";
  }

  // Escape CSV values
  const escapeValue = (val: string): string => {
    if (val.includes(",") || val.includes('"') || val.includes("\n")) {
      return `"${val.replace(/"/g, '""')}"`;
    }
    return val;
  };

  // For arrays of objects, create one row per item with flattened columns
  if (Array.isArray(data)) {
    if (data.length === 0) return "";

    // Flatten all items and collect all keys, preserving order from first item
    const flattenedItems = data.map((item) => flattenForCsv(item));
    const seenKeys = new Set<string>();
    const headers: string[] = [];
    // Preserve key order: first item's keys in order, then any additional keys from other items
    flattenedItems.forEach((item) => {
      Object.keys(item).forEach((key) => {
        if (!seenKeys.has(key)) {
          seenKeys.add(key);
          headers.push(key);
        }
      });
    });

    // Format headers to be more readable (e.g., "messageId" -> "Message Id")
    const formattedHeaders = headers.map((h) => formatLabel(h));

    const rows = [
      formattedHeaders.map(escapeValue).join(","),
      ...flattenedItems.map((item) => headers.map((h) => escapeValue(item[h] ?? "")).join(",")),
    ];

    return rows.join("\n");
  }

  // For single objects, create key-value pairs as rows
  const flattened = flattenForCsv(data);
  const rows = [
    "Key,Value",
    ...Object.entries(flattened).map(
      ([k, v]) => `${escapeValue(formatLabel(k))},${escapeValue(v)}`,
    ),
  ];

  return rows.join("\n");
}

// Trigger file download
function downloadFile(content: string, filename: string, mimeType: string) {
  const blob = new Blob([content], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.dispatchEvent(new MouseEvent("click", { bubbles: false, cancelable: false, view: window }));
  URL.revokeObjectURL(url);
}

function DownloadDropdown({
  fullData,
  filteredData,
  hasFilter,
}: {
  fullData: unknown;
  filteredData: unknown;
  hasFilter: boolean;
}) {
  const handleDownloadJson = () => {
    const jsonString = JSON.stringify(fullData, null, 2);
    downloadFile(jsonString, "data.json", "application/json");
  };

  const handleDownloadCsv = () => {
    const csv = jsonToCsv(fullData);
    downloadFile(csv, "data.csv", "text/csv");
  };

  const handleDownloadFilteredCsv = () => {
    const csv = jsonToCsv(filteredData);
    downloadFile(csv, "data-filtered.csv", "text/csv");
  };

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          className="flex items-center gap-1 px-1.5 py-0.5 text-[10px] text-muted-foreground hover:text-foreground transition-colors rounded hover:bg-muted"
          title="Download"
        >
          <Download className="h-3 w-3" />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="min-w-[120px]">
        <DropdownMenuItem onClick={handleDownloadJson} className="text-xs cursor-pointer">
          <FileJson className="h-3 w-3 mr-2" />
          JSON
        </DropdownMenuItem>
        <DropdownMenuItem onClick={handleDownloadCsv} className="text-xs cursor-pointer">
          <FileSpreadsheet className="h-3 w-3 mr-2" />
          CSV
        </DropdownMenuItem>
        {hasFilter && (
          <DropdownMenuItem onClick={handleDownloadFilteredCsv} className="text-xs cursor-pointer">
            <Filter className="h-3 w-3 mr-2" />
            CSV (filtered)
          </DropdownMenuItem>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

// Context for key filtering
type FilterContextType = {
  filteredKey: string | null;
  setFilteredKey: (key: string | null) => void;
};
const FilterContext = createContext<FilterContextType>({
  filteredKey: null,
  setFilteredKey: () => {},
});

type JsonCodeEditorProps = {
  value: string;
  onChange?: (value: string) => void;
  readOnly?: boolean;
  minHeight?: string;
  maxHeight?: string;
  height?: string;
  resizeHandleProps?: {
    className: string;
    style: React.CSSProperties;
    onMouseDown: (e: React.MouseEvent) => void;
  };
  placeholder?: string;
  overlay?: React.ReactNode;
  bottomRightOverlay?: React.ReactNode;
  overlayPlacement?: "default" | "corner";
  resizable?: boolean;
  showValidation?: boolean;
};

type JsonEditorProps = JsonCodeEditorProps & {
  tableEnabled?: boolean;
  defaultView?: "raw" | "table";
};

function ViewToggle({
  view,
  onViewChange,
}: {
  view: "raw" | "table";
  onViewChange: (v: "raw" | "table") => void;
}) {
  return (
    <div className="flex items-center bg-muted rounded-md p-0.5 border border-border/50 w-fit">
      <button
        onClick={() => onViewChange("raw")}
        className={cn(
          "flex items-center gap-1 px-1.5 py-0.5 text-[10px] font-medium rounded transition-all",
          view === "raw"
            ? "bg-background text-foreground shadow-sm"
            : "text-muted-foreground hover:text-foreground",
        )}
      >
        <Code className="h-2.5 w-2.5" />
        Raw
      </button>
      <button
        onClick={() => onViewChange("table")}
        className={cn(
          "flex items-center gap-1 px-1.5 py-0.5 text-[10px] font-medium rounded transition-all",
          view === "table"
            ? "bg-background text-foreground shadow-sm"
            : "text-muted-foreground hover:text-foreground",
        )}
      >
        <Table className="h-2.5 w-2.5" />
        Table
      </button>
    </div>
  );
}

function AtomicValue({ value }: { value: unknown }) {
  const [copied, setCopied] = useState(false);

  const copyValue = async () => {
    const text = value === null ? "null" : value === undefined ? "undefined" : String(value);
    await navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };

  if (value === null) {
    return (
      <span className="group inline-flex items-center gap-1">
        <span className="text-muted-foreground italic">null</span>
        <button
          onClick={copyValue}
          className="opacity-0 group-hover:opacity-100 transition-opacity"
        >
          {copied ? (
            <Check className="h-3 w-3 text-green-500" />
          ) : (
            <Copy className="h-3 w-3 text-muted-foreground hover:text-foreground" />
          )}
        </button>
      </span>
    );
  }

  if (value === undefined) {
    return (
      <span className="group inline-flex items-center gap-1">
        <span className="text-muted-foreground italic">undefined</span>
        <button
          onClick={copyValue}
          className="opacity-0 group-hover:opacity-100 transition-opacity"
        >
          {copied ? (
            <Check className="h-3 w-3 text-green-500" />
          ) : (
            <Copy className="h-3 w-3 text-muted-foreground hover:text-foreground" />
          )}
        </button>
      </span>
    );
  }

  if (typeof value === "boolean") {
    return (
      <span className="group inline-flex items-center gap-1">
        <span
          className={
            value ? "text-green-600 dark:text-green-400" : "text-red-600 dark:text-red-400"
          }
        >
          {value ? "true" : "false"}
        </span>
        <button
          onClick={copyValue}
          className="opacity-0 group-hover:opacity-100 transition-opacity"
        >
          {copied ? (
            <Check className="h-3 w-3 text-green-500" />
          ) : (
            <Copy className="h-3 w-3 text-muted-foreground hover:text-foreground" />
          )}
        </button>
      </span>
    );
  }

  if (typeof value === "number") {
    return (
      <span className="group inline-flex items-center gap-1">
        <span className="text-blue-600 dark:text-blue-400">{value}</span>
        <button
          onClick={copyValue}
          className="opacity-0 group-hover:opacity-100 transition-opacity"
        >
          {copied ? (
            <Check className="h-3 w-3 text-green-500" />
          ) : (
            <Copy className="h-3 w-3 text-muted-foreground hover:text-foreground" />
          )}
        </button>
      </span>
    );
  }

  const str = String(value);
  const isUrl = str.startsWith("http://") || str.startsWith("https://");
  const isLong = str.length > 100;

  // ISO date detection
  const isoDateRegex = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d{3})?Z?$/;
  const isDate = isoDateRegex.test(str);

  if (isDate) {
    const date = new Date(str);
    const formatted = date.toLocaleString(undefined, {
      year: "numeric",
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
    return (
      <span className="group inline-flex items-center gap-1">
        <span className="text-foreground/80" title={str}>
          {formatted}
        </span>
        <button
          onClick={copyValue}
          className="opacity-0 group-hover:opacity-100 transition-opacity flex-shrink-0"
        >
          {copied ? (
            <Check className="h-3 w-3 text-green-500" />
          ) : (
            <Copy className="h-3 w-3 text-muted-foreground hover:text-foreground" />
          )}
        </button>
      </span>
    );
  }

  if (isUrl) {
    return (
      <span className="group inline-flex items-center gap-1">
        <a
          href={str}
          target="_blank"
          rel="noopener noreferrer"
          className="text-primary hover:underline truncate max-w-[300px] inline-block align-bottom"
          title={str}
        >
          {isLong ? str.slice(0, 100) + "..." : str}
        </a>
        <button
          onClick={copyValue}
          className="opacity-0 group-hover:opacity-100 transition-opacity flex-shrink-0"
        >
          {copied ? (
            <Check className="h-3 w-3 text-green-500" />
          ) : (
            <Copy className="h-3 w-3 text-muted-foreground hover:text-foreground" />
          )}
        </button>
      </span>
    );
  }

  return (
    <span className="group inline-flex items-center gap-1">
      <span
        className={isLong ? "truncate max-w-[300px] inline-block align-bottom" : ""}
        title={isLong ? str : undefined}
      >
        {isLong ? str.slice(0, 100) + "..." : str}
      </span>
      <button
        onClick={copyValue}
        className="opacity-0 group-hover:opacity-100 transition-opacity flex-shrink-0"
      >
        {copied ? (
          <Check className="h-3 w-3 text-green-500" />
        ) : (
          <Copy className="h-3 w-3 text-muted-foreground hover:text-foreground" />
        )}
      </button>
    </span>
  );
}

function ExpandableRow({
  label,
  value,
  keyPath,
  depth = 0,
}: {
  label: string;
  value: unknown;
  keyPath: string;
  depth?: number;
}) {
  const [expanded, setExpanded] = useState(depth < 3);
  const { filteredKey, setFilteredKey } = useContext(FilterContext);

  const isExpandable = value !== null && value !== undefined && typeof value === "object";
  const isArray = Array.isArray(value);
  const count = isArray
    ? value.length
    : value
      ? Object.keys(value as Record<string, unknown>).length
      : 0;
  const typeLabel = isArray
    ? count === 1
      ? "1 item"
      : `${count} items`
    : count === 1
      ? "1 field"
      : `${count} fields`;
  // Don't format array indices like #1, #2
  const displayLabel = label.startsWith("#") ? label : formatLabel(label);

  // Check if this key is currently filtered
  const isFiltered = filteredKey === keyPath;

  // For non-expandable (leaf) rows, show filter button
  const filterButton = !isExpandable && !label.startsWith("#") && (
    <button
      onClick={(e) => {
        e.stopPropagation();
        setFilteredKey(isFiltered ? null : keyPath);
      }}
      className={cn(
        "ml-1 p-0.5 rounded transition-opacity",
        isFiltered
          ? "opacity-100 text-primary"
          : "opacity-0 group-hover:opacity-100 text-muted-foreground hover:text-foreground",
      )}
      title={isFiltered ? "Clear filter" : `Filter to show only "${label}"`}
    >
      <Filter className="h-3 w-3" />
    </button>
  );

  if (!isExpandable) {
    return (
      <tr className="group border-b border-border/30 hover:bg-muted/30">
        <td className="px-3 py-2 font-medium text-foreground/90 w-[200px] align-top">
          <span className="inline-flex items-center">
            {displayLabel}
            {filterButton}
          </span>
        </td>
        <td className="px-3 py-2 font-mono text-foreground/80">
          <AtomicValue value={value} />
        </td>
      </tr>
    );
  }

  if (count === 0) {
    return (
      <tr className="border-b border-border/30 hover:bg-muted/30">
        <td className="px-3 py-2 font-medium text-foreground/90 w-[200px] align-top">
          {displayLabel}
        </td>
        <td className="px-3 py-2 font-mono text-muted-foreground">
          {isArray ? "Empty list" : "Empty"}
        </td>
      </tr>
    );
  }

  return (
    <>
      <tr
        className="border-b border-border/30 hover:bg-muted/30 cursor-pointer"
        onClick={() => setExpanded(!expanded)}
      >
        <td className="px-3 py-2 font-medium text-foreground/90 w-[200px] align-top">
          <div className="flex items-center gap-1">
            {expanded ? (
              <ChevronDown className="h-3 w-3 text-muted-foreground" />
            ) : (
              <ChevronRight className="h-3 w-3 text-muted-foreground" />
            )}
            {displayLabel}
          </div>
        </td>
        <td className="px-3 py-2 font-mono text-muted-foreground">{typeLabel}</td>
      </tr>
      {expanded && (
        <tr>
          <td colSpan={2} className="p-0">
            <div className="ml-6 border-l border-border/50">
              <LazyTableView data={value} parentPath={keyPath} depth={depth + 1} />
            </div>
          </td>
        </tr>
      )}
    </>
  );
}

// Check if an object contains the filtered key anywhere in its tree
function containsKey(obj: unknown, keyName: string): boolean {
  if (obj === null || obj === undefined || typeof obj !== "object") return false;

  if (Array.isArray(obj)) {
    return obj.some((item) => containsKey(item, keyName));
  }

  const record = obj as Record<string, unknown>;
  for (const [k, v] of Object.entries(record)) {
    if (k.toLowerCase().includes(keyName.toLowerCase())) return true;
    if (containsKey(v, keyName)) return true;
  }
  return false;
}

function LazyTableView({
  data,
  parentPath = "",
  depth = 0,
}: {
  data: unknown;
  depth?: number;
  parentPath?: string;
}) {
  const [visibleCount, setVisibleCount] = useState(ROWS_PER_PAGE);
  const { filteredKey } = useContext(FilterContext);

  const keyName = filteredKey?.split(".").pop()?.toLowerCase() || "";

  // Handle arrays
  if (Array.isArray(data)) {
    if (data.length === 0) {
      return <div className="p-4 text-xs text-muted-foreground">Empty array</div>;
    }

    // Filter array items to only those containing the key, preserving original indices
    const indexedData = data.map((item, index) => ({ item, originalIndex: index }));
    const filteredData = filteredKey
      ? indexedData.filter(({ item }) => containsKey(item, keyName))
      : indexedData;

    if (filteredKey && filteredData.length === 0) {
      return <div className="p-4 text-xs text-muted-foreground">No matches found</div>;
    }

    const visibleRows = filteredData.slice(0, visibleCount);
    const remaining = filteredData.length - visibleCount;

    return (
      <div>
        <table className="w-full text-xs border-collapse">
          <tbody>
            {visibleRows.map(({ item, originalIndex }) => {
              const itemPath = parentPath
                ? `${parentPath}[${originalIndex}]`
                : `[${originalIndex}]`;
              return (
                <ExpandableRow
                  key={originalIndex}
                  label={`#${originalIndex + 1}`}
                  value={item}
                  keyPath={itemPath}
                  depth={depth}
                />
              );
            })}
          </tbody>
        </table>
        {remaining > 0 && (
          <button
            onClick={() => setVisibleCount((c) => c + ROWS_PER_PAGE)}
            className="w-full py-2 text-xs text-muted-foreground hover:text-foreground hover:bg-muted/50 transition-colors border-t border-border/30"
          >
            Show {Math.min(remaining, ROWS_PER_PAGE)} more ({remaining} remaining)
          </button>
        )}
      </div>
    );
  }

  if (typeof data === "object" && data !== null) {
    const entries = Object.entries(data as Record<string, unknown>);

    // Filter entries to only those matching or containing the key
    const filteredEntries = filteredKey
      ? entries.filter(([k, v]) => k.toLowerCase().includes(keyName) || containsKey(v, keyName))
      : entries;

    if (filteredKey && filteredEntries.length === 0) {
      return <div className="p-4 text-xs text-muted-foreground">No matches found</div>;
    }

    const visibleEntries = filteredEntries.slice(0, visibleCount);
    const remaining = filteredEntries.length - visibleCount;

    return (
      <div>
        <table className="w-full text-xs border-collapse">
          <tbody>
            {visibleEntries.map(([key, val]) => {
              const keyPath = parentPath ? `${parentPath}.${key}` : key;
              return (
                <ExpandableRow key={key} label={key} value={val} keyPath={keyPath} depth={depth} />
              );
            })}
          </tbody>
        </table>
        {remaining > 0 && (
          <button
            onClick={() => setVisibleCount((c) => c + ROWS_PER_PAGE)}
            className="w-full py-2 text-xs text-muted-foreground hover:text-foreground hover:bg-muted/50 transition-colors border-t border-border/30"
          >
            Show {Math.min(remaining, ROWS_PER_PAGE)} more ({remaining} remaining)
          </button>
        )}
      </div>
    );
  }

  return (
    <div className="p-4 text-xs text-muted-foreground">
      Cannot display as table. Data must be an array or an object.
    </div>
  );
}

// Filter data the same way the table view does - filters both rows AND fields
function filterData(data: unknown, filteredKey: string | null): unknown {
  if (!filteredKey) return data;

  const keyName = filteredKey.split(".").pop()?.toLowerCase() || "";

  // Recursively filter object to only include matching keys
  function filterObjectFields(obj: unknown): unknown {
    if (obj === null || obj === undefined || typeof obj !== "object") {
      return obj;
    }

    if (Array.isArray(obj)) {
      return obj.map((item) => filterObjectFields(item));
    }

    const result: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(obj as Record<string, unknown>)) {
      if (k.toLowerCase().includes(keyName)) {
        result[k] = v;
      } else if (typeof v === "object" && v !== null) {
        const filtered = filterObjectFields(v);
        if (Array.isArray(filtered) && filtered.length > 0) {
          result[k] = filtered;
        } else if (
          filtered &&
          typeof filtered === "object" &&
          !Array.isArray(filtered) &&
          Object.keys(filtered as object).length > 0
        ) {
          result[k] = filtered;
        }
      }
    }
    return result;
  }

  if (Array.isArray(data)) {
    // Filter rows that contain the key, then filter fields within each row
    const filteredRows = data.filter((item) => containsKey(item, keyName));
    return filteredRows.map((item) => filterObjectFields(item));
  }

  if (typeof data === "object" && data !== null) {
    return filterObjectFields(data);
  }

  return data;
}

function JsonTableView({
  data,
  onFilterChange,
}: {
  data: unknown;
  onFilterChange: (filteredData: unknown, hasFilter: boolean) => void;
}) {
  const [filteredKey, setFilteredKey] = useState<string | null>(null);
  const [searchValue, setSearchValue] = useState("");

  // Update filtered data when data or filter changes
  React.useEffect(() => {
    onFilterChange(filterData(data, filteredKey), !!filteredKey);
  }, [data, filteredKey, onFilterChange]);

  // Sync search input with filtered key
  const handleSearchChange = (value: string) => {
    setSearchValue(value);
    setFilteredKey(value.trim() || null);
  };

  const handleFilterClick = (key: string | null) => {
    setFilteredKey(key);
    setSearchValue(key ? key.split(".").pop() || key : "");
  };

  return (
    <FilterContext.Provider value={{ filteredKey, setFilteredKey: handleFilterClick }}>
      <div className="flex items-center gap-2 px-3 py-1.5 border-b border-border/50">
        <Search className="h-3 w-3 text-muted-foreground" />
        <input
          type="text"
          value={searchValue}
          onChange={(e) => handleSearchChange(e.target.value)}
          placeholder="Filter by key name..."
          className="flex-1 bg-transparent text-xs outline-none placeholder:text-muted-foreground/50"
        />
        {filteredKey && (
          <button
            onClick={() => handleFilterClick(null)}
            className="text-xs text-muted-foreground hover:text-foreground flex items-center gap-1"
          >
            <X className="h-3 w-3" />
          </button>
        )}
      </div>
      <LazyTableView data={data} depth={0} />
    </FilterContext.Provider>
  );
}

export const JsonEditor = ({
  tableEnabled,
  defaultView = "raw",
  value,
  readOnly,
  overlay,
  maxHeight = "1000px",
  height,
  ...rest
}: JsonEditorProps) => {
  // Initialize from localStorage, fall back to defaultView
  const [view, setView] = useState<"raw" | "table">(() => {
    if (typeof window === "undefined") return defaultView;
    const saved = localStorage.getItem(VIEW_PREFERENCE_KEY);
    if (saved === "raw" || saved === "table") return saved;
    return defaultView;
  });

  // Track filtered data for downloads
  const [filteredData, setFilteredData] = useState<unknown>(null);
  const [hasFilter, setHasFilter] = useState(false);

  // Update localStorage when view changes
  const handleViewChange = (newView: "raw" | "table") => {
    setView(newView);
    localStorage.setItem(VIEW_PREFERENCE_KEY, newView);
  };

  const handleFilterChange = React.useCallback((data: unknown, isFiltered: boolean) => {
    setFilteredData(data);
    setHasFilter(isFiltered);
  }, []);

  const parsed = useMemo(() => {
    try {
      const trimmed = value?.trim();
      if (!trimmed) return undefined;
      return JSON.parse(trimmed);
    } catch {
      return undefined;
    }
  }, [value]);

  // Disable table view for very large content to prevent CPU freeze
  const isTooLargeForTable = (value?.length || 0) > TABLE_VIEW_SIZE_LIMIT;
  const canTable = (tableEnabled ?? !!readOnly) && !isTooLargeForTable;
  const hasContent = parsed !== undefined && parsed !== null && typeof parsed === "object";
  const showToggle = canTable && hasContent;

  const effectiveView = showToggle ? view : "raw";

  // Filtered CSV data (only in table view with active filter)
  const csvFilteredData =
    effectiveView === "table" && filteredData !== null ? filteredData : parsed;
  const showFilteredOption = effectiveView === "table" && hasFilter;

  if (!showToggle) {
    return (
      <JsonCodeEditor
        value={value}
        readOnly={readOnly}
        overlay={overlay}
        maxHeight={maxHeight}
        height={height}
        {...rest}
      />
    );
  }

  return (
    <div className="rounded-lg border shadow-sm bg-muted/30 overflow-hidden">
      <div className="flex items-center justify-between px-2 py-1 border-b border-border/50">
        <ViewToggle view={effectiveView} onViewChange={handleViewChange} />
        <div className="flex items-center gap-1">
          {overlay}
          <DownloadDropdown
            fullData={parsed}
            filteredData={csvFilteredData}
            hasFilter={showFilteredOption}
          />
          <CopyButton text={value || rest.placeholder || "{}"} />
        </div>
      </div>
      {effectiveView === "table" && parsed ? (
        <div style={{ maxHeight: maxHeight, overflow: "auto" }}>
          <JsonTableView data={parsed} onFilterChange={handleFilterChange} />
        </div>
      ) : (
        <JsonCodeEditor
          value={value}
          readOnly={readOnly}
          overlay={<></>}
          maxHeight={maxHeight}
          height={height}
          noBorder
          {...rest}
        />
      )}
    </div>
  );
};
