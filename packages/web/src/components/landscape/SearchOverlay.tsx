"use client";

import { System } from "@superglue/shared";
import { Globe, Hammer, Search } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

type SearchableItem = {
  id: string;
  type: "system" | "tool";
  label: string;
  data?: any;
};

interface SearchOverlayProps {
  isOpen: boolean;
  onClose: () => void;
  systems: System[];
  tools: any[];
  onSelectItem: (nodeId: string) => void;
}

export function SearchOverlay({
  isOpen,
  onClose,
  systems,
  tools,
  onSelectItem,
}: SearchOverlayProps) {
  const [query, setQuery] = useState("");
  const [selectedIndex, setSelectedIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const resultsRef = useRef<HTMLDivElement>(null);

  // Create searchable items
  const items = useMemo(() => {
    const searchItems: SearchableItem[] = [
      ...systems.map((int) => ({
        id: `int-${int.id}`,
        type: "system" as const,
        label: int.id,
        data: int,
      })),
      ...tools.map((tool) => ({
        id: `tool-${tool.id}`,
        type: "tool" as const,
        label: tool.id,
        data: tool,
      })),
    ];
    return searchItems;
  }, [systems, tools]);

  // Filter items based on query
  const filteredItems = useMemo(() => {
    if (!query.trim()) return items;
    const lowerQuery = query.toLowerCase();
    return items.filter((item) => item.label.toLowerCase().includes(lowerQuery));
  }, [items, query]);

  // Reset selected index when query changes
  useEffect(() => {
    setSelectedIndex(0);
  }, [query]);

  // Focus input when opened
  useEffect(() => {
    if (isOpen) {
      setQuery("");
      setSelectedIndex(0);
      setTimeout(() => inputRef.current?.focus(), 50);
    }
  }, [isOpen]);

  // Scroll selected item into view
  useEffect(() => {
    if (!resultsRef.current) return;
    const selectedEl = resultsRef.current.children[selectedIndex] as HTMLElement;
    if (selectedEl) {
      selectedEl.scrollIntoView({ block: "nearest", behavior: "smooth" });
    }
  }, [selectedIndex]);

  const handleSelect = useCallback(
    (item: SearchableItem) => {
      onSelectItem(item.id);
      onClose();
    },
    [onSelectItem, onClose],
  );

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      switch (e.key) {
        case "ArrowDown":
          e.preventDefault();
          setSelectedIndex((prev) => (prev < filteredItems.length - 1 ? prev + 1 : prev));
          break;
        case "ArrowUp":
          e.preventDefault();
          setSelectedIndex((prev) => (prev > 0 ? prev - 1 : 0));
          break;
        case "Enter":
          e.preventDefault();
          if (filteredItems[selectedIndex]) {
            handleSelect(filteredItems[selectedIndex]);
          }
          break;
        case "Escape":
          e.preventDefault();
          onClose();
          break;
      }
    },
    [filteredItems, selectedIndex, handleSelect, onClose],
  );

  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 z-[10000] flex items-start justify-center pt-[20vh] bg-black/60 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        className="w-full max-w-2xl mx-4 bg-gradient-to-br from-muted/50 to-muted/30 dark:from-muted/50 dark:to-muted/30 backdrop-blur-sm border border-border/50 dark:border-border/70 rounded-2xl shadow-lg overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center gap-3 px-4 py-3 border-b border-border/50">
          <Search className="h-5 w-5 text-muted-foreground flex-shrink-0" />
          <input
            ref={inputRef}
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Search systems and tools..."
            className="flex-1 bg-transparent border-none outline-none text-sm text-foreground placeholder:text-muted-foreground"
          />
          <kbd className="px-2 py-1 text-xs font-mono bg-muted text-muted-foreground rounded border border-border">
            ESC
          </kbd>
        </div>

        {/* Results */}
        <div ref={resultsRef} className="max-h-[400px] overflow-y-auto overscroll-contain">
          {filteredItems.length === 0 ? (
            <div className="px-4 py-8 text-center text-sm text-muted-foreground">
              {query ? "No matches found" : "Start typing to search..."}
            </div>
          ) : (
            filteredItems.map((item, index) => (
              <div
                key={item.id}
                className={`
                  flex items-center gap-3 px-4 py-3 cursor-pointer transition-colors
                  ${
                    index === selectedIndex
                      ? "bg-accent text-accent-foreground"
                      : "hover:bg-muted/50"
                  }
                  ${index > 0 ? "border-t border-border/50" : ""}
                `}
                onClick={() => handleSelect(item)}
                onMouseEnter={() => setSelectedIndex(index)}
              >
                {item.type === "system" ? (
                  <Globe className="h-4 w-4 text-muted-foreground flex-shrink-0" />
                ) : (
                  <Hammer className="h-4 w-4 text-[#FFA500] flex-shrink-0" />
                )}
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-medium truncate">{item.label}</div>
                  <div className="text-xs text-muted-foreground">
                    {item.type === "system" ? "System" : "Tool"}
                  </div>
                </div>
                {index === selectedIndex && (
                  <kbd className="px-2 py-1 text-xs font-mono bg-background text-muted-foreground rounded border border-border">
                    ↵
                  </kbd>
                )}
              </div>
            ))
          )}
        </div>

        {filteredItems.length > 0 && (
          <div className="px-4 py-2 border-t border-border/50 bg-muted/20 text-xs text-muted-foreground flex items-center gap-4">
            <span className="flex items-center gap-1">
              <kbd className="px-1.5 py-0.5 font-mono bg-background rounded border border-border">
                ↑
              </kbd>
              <kbd className="px-1.5 py-0.5 font-mono bg-background rounded border border-border">
                ↓
              </kbd>
              navigate
            </span>
            <span className="flex items-center gap-1">
              <kbd className="px-1.5 py-0.5 font-mono bg-background rounded border border-border">
                ↵
              </kbd>
              select
            </span>
          </div>
        )}
      </div>
    </div>
  );
}
