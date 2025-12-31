"use client";

import { Button } from "@/src/components/ui/button";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandSeparator,
} from "@/src/components/ui/command";
import { Popover, PopoverContent, PopoverTrigger } from "@/src/components/ui/popover";
import { cn } from "@/src/lib/general-utils";
import { Tool } from "@superglue/shared";
import { Archive, Check, ChevronRight, Folder, FolderOpen } from "lucide-react";
import { useMemo, useState } from "react";

const FOLDER_STORAGE_KEY = "superglue-selected-folder";
const UNCATEGORIZED = "";

interface FolderNode {
  name: string;
  fullPath: string;
  count: number;
  children: FolderNode[];
  depth: number;
}

interface FolderSelectorProps {
  tools: Tool[];
  selectedFolder: string;
  onFolderChange: (folder: string) => void;
}

export function FolderSelector({ tools, selectedFolder, onFolderChange }: FolderSelectorProps) {
  const [open, setOpen] = useState(false);
  const [searchValue, setSearchValue] = useState("");

  const { flatFolders, totalCount, archivedCount } = useMemo(() => {
    const folderCounts = new Map<string, number>();
    let total = 0;
    let archived = 0;

    tools.forEach((tool) => {
      if (tool.archived) {
        archived++;
        return;
      }
      const folder = tool.folder || UNCATEGORIZED;
      folderCounts.set(folder, (folderCounts.get(folder) || 0) + 1);
      total++;
    });

    const flatList: FolderNode[] = [];
    const processedPaths = new Set<string>();

    const sortedFolders = Array.from(folderCounts.keys()).sort();

    sortedFolders.forEach((folderPath) => {
      const parts = folderPath.split("/");
      let currentPath = "";

      parts.forEach((part, index) => {
        currentPath = index === 0 ? part : `${currentPath}/${part}`;

        if (!processedPaths.has(currentPath)) {
          processedPaths.add(currentPath);
          const isLeaf = currentPath === folderPath;
          flatList.push({
            name: part,
            fullPath: currentPath,
            count: isLeaf ? folderCounts.get(folderPath) || 0 : 0,
            children: [],
            depth: index,
          });
        }
      });
    });

    return { flatFolders: flatList, totalCount: total, archivedCount: archived };
  }, [tools]);

  const displayLabel = useMemo(() => {
    if (selectedFolder === "all") return `All (${totalCount})`;
    if (selectedFolder === "archived") return `Archived (${archivedCount})`;
    const folder = flatFolders.find((f) => f.fullPath === selectedFolder);
    if (folder) return `${folder.fullPath} (${folder.count})`;
    return selectedFolder;
  }, [selectedFolder, flatFolders, totalCount, archivedCount]);

  const handleSelect = (folder: string) => {
    onFolderChange(folder);
    setOpen(false);
    setSearchValue("");
  };

  const filteredFolders = useMemo(() => {
    if (!searchValue) return flatFolders;
    const lower = searchValue.toLowerCase();
    return flatFolders.filter((f) => f.fullPath.toLowerCase().includes(lower));
  }, [flatFolders, searchValue]);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          role="combobox"
          aria-expanded={open}
          className="w-[220px] justify-between"
        >
          <div className="flex items-center gap-2 truncate">
            <Folder className="h-4 w-4 flex-shrink-0" />
            <span className="truncate">{displayLabel}</span>
          </div>
          <ChevronRight
            className={cn(
              "ml-2 h-4 w-4 shrink-0 opacity-50 transition-transform",
              open && "rotate-90",
            )}
          />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-[280px] p-0" align="start">
        <Command>
          <CommandInput
            placeholder="Search folders..."
            value={searchValue}
            onValueChange={setSearchValue}
          />
          <CommandList>
            <CommandEmpty>No folders found.</CommandEmpty>
            <CommandGroup className="p-1">
              <CommandItem
                value="all"
                onSelect={() => handleSelect("all")}
                className="cursor-pointer px-2 py-1.5"
              >
                {selectedFolder === "all" ? (
                  <Check className="mr-2 h-4 w-4 flex-shrink-0" />
                ) : (
                  <FolderOpen className="mr-2 h-4 w-4 flex-shrink-0" />
                )}
                <span className={selectedFolder === "all" ? "font-medium" : ""}>All</span>
                <span className="ml-auto text-xs text-muted-foreground">{totalCount}</span>
              </CommandItem>
            </CommandGroup>
            <CommandSeparator />
            <CommandGroup heading="Folders" className="p-1">
              {filteredFolders.map((folder) => {
                const isSelected = selectedFolder === folder.fullPath;
                return (
                  <CommandItem
                    key={folder.fullPath}
                    value={folder.fullPath}
                    onSelect={() => handleSelect(folder.fullPath)}
                    className="cursor-pointer py-1.5"
                    style={{ paddingLeft: `${folder.depth * 12 + 8}px` }}
                  >
                    {isSelected ? (
                      <Check className="mr-2 h-4 w-4 flex-shrink-0" />
                    ) : (
                      <Folder className="mr-2 h-4 w-4 flex-shrink-0" />
                    )}
                    <span className={cn("truncate", isSelected && "font-medium")}>
                      {folder.name || "No Folder"}
                    </span>
                    {folder.count > 0 && (
                      <span className="ml-auto text-xs text-muted-foreground">{folder.count}</span>
                    )}
                  </CommandItem>
                );
              })}
            </CommandGroup>
            {archivedCount > 0 && (
              <>
                <CommandSeparator />
                <CommandGroup className="p-1">
                  <CommandItem
                    value="archived"
                    onSelect={() => handleSelect("archived")}
                    className="cursor-pointer px-2 py-1.5"
                  >
                    {selectedFolder === "archived" ? (
                      <Check className="mr-2 h-4 w-4 flex-shrink-0" />
                    ) : (
                      <Archive className="mr-2 h-4 w-4 flex-shrink-0" />
                    )}
                    <span className={selectedFolder === "archived" ? "font-medium" : ""}>
                      Archived
                    </span>
                    <span className="ml-auto text-xs text-muted-foreground">{archivedCount}</span>
                  </CommandItem>
                </CommandGroup>
              </>
            )}
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}

export function useFolderFilter(tools: Tool[]) {
  const [selectedFolder, setSelectedFolder] = useState<string>(() => {
    if (typeof window !== "undefined") {
      return localStorage.getItem(FOLDER_STORAGE_KEY) || "all";
    }
    return "all";
  });

  const handleFolderChange = (folder: string) => {
    setSelectedFolder(folder);
    if (typeof window !== "undefined") {
      localStorage.setItem(FOLDER_STORAGE_KEY, folder);
    }
  };

  const filteredByFolder = useMemo(() => {
    if (selectedFolder === "archived") {
      return tools.filter((tool) => tool.archived);
    }

    const nonArchived = tools.filter((tool) => !tool.archived);
    if (selectedFolder === "all") return nonArchived;

    return nonArchived.filter((tool) => {
      const toolFolder = tool.folder || UNCATEGORIZED;
      return toolFolder === selectedFolder || toolFolder.startsWith(`${selectedFolder}/`);
    });
  }, [tools, selectedFolder]);

  const allFolderPaths = useMemo(() => {
    const paths = new Set<string>();
    tools.forEach((tool) => {
      if (tool.folder) paths.add(tool.folder);
    });
    return Array.from(paths).sort();
  }, [tools]);

  return {
    selectedFolder,
    setSelectedFolder: handleFolderChange,
    filteredByFolder,
    allFolderPaths,
  };
}

export { FOLDER_STORAGE_KEY, UNCATEGORIZED };
