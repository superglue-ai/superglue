"use client";

import { useTools } from "@/src/app/tools-context";
import { Button } from "@/src/components/ui/button";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/src/components/ui/command";
import { Input } from "@/src/components/ui/input";
import { Popover, PopoverContent, PopoverTrigger } from "@/src/components/ui/popover";
import { cn } from "@/src/lib/general-utils";
import { Check, CornerDownLeft, Folder, Loader2, Plus } from "lucide-react";
import { useMemo, useState } from "react";

export const UNCATEGORIZED = "";

interface FolderNode {
  name: string;
  fullPath: string;
  depth: number;
}

interface FolderPickerProps {
  value: string | undefined;
  onChange: (folder: string | null) => void;
  trigger?: React.ReactNode;
  disabled?: boolean;
  align?: "start" | "center" | "end";
  width?: string;
  loadingFolder?: string | null;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
}

export function FolderPicker({
  value,
  onChange,
  trigger,
  disabled,
  align = "start",
  width = "w-[250px]",
  loadingFolder,
  open: controlledOpen,
  onOpenChange,
}: FolderPickerProps) {
  const { tools } = useTools();
  const [internalOpen, setInternalOpen] = useState(false);
  const [searchValue, setSearchValue] = useState("");
  const [showNewInput, setShowNewInput] = useState(false);
  const [newFolderName, setNewFolderName] = useState("");
  const [pendingFolders, setPendingFolders] = useState<string[]>([]);

  const isControlled = controlledOpen !== undefined;
  const open = isControlled ? controlledOpen : internalOpen;

  const flatFolders = useMemo(() => {
    const fromTools = tools.map((t) => t.folder).filter(Boolean) as string[];
    const allFolders = [...fromTools, ...pendingFolders, ...(value ? [value] : [])];
    const uniqueFolders = Array.from(new Set(allFolders)).sort();
    const flatList: FolderNode[] = [];
    const processedPaths = new Set<string>();

    uniqueFolders.forEach((folderPath) => {
      const parts = folderPath.split("/");
      let currentPath = "";
      parts.forEach((part, index) => {
        currentPath = index === 0 ? part : `${currentPath}/${part}`;
        if (!processedPaths.has(currentPath)) {
          processedPaths.add(currentPath);
          flatList.push({ name: part, fullPath: currentPath, depth: index });
        }
      });
    });
    return flatList;
  }, [tools, value, pendingFolders]);

  const allFolderPaths = useMemo(() => flatFolders.map((f) => f.fullPath), [flatFolders]);

  const filteredFolders = useMemo(() => {
    if (!searchValue) return flatFolders;
    const lower = searchValue.toLowerCase();
    return flatFolders.filter((f) => f.fullPath.toLowerCase().includes(lower));
  }, [flatFolders, searchValue]);

  const isNewFolder =
    searchValue.trim() &&
    !allFolderPaths.some((f) => f.toLowerCase() === searchValue.toLowerCase());

  const handleSelect = (folder: string | null) => {
    onChange(folder);
    if (!isControlled) {
      closeAndReset();
    }
  };

  const handleCreateFolder = () => {
    const trimmed = newFolderName.trim();
    if (trimmed && !allFolderPaths.some((f) => f.toLowerCase() === trimmed.toLowerCase())) {
      setPendingFolders((prev) => [...prev, trimmed]);
    }
    setNewFolderName("");
    setShowNewInput(false);
  };

  const closeAndReset = () => {
    setSearchValue("");
    setShowNewInput(false);
    setNewFolderName("");
    setPendingFolders([]);
    if (isControlled) {
      onOpenChange?.(false);
    } else {
      setInternalOpen(false);
    }
  };

  const handleOpenChange = (isOpen: boolean) => {
    if (disabled) return;
    if (isOpen) {
      if (isControlled) {
        onOpenChange?.(true);
      } else {
        setInternalOpen(true);
      }
    } else {
      closeAndReset();
    }
  };

  const renderFolderIcon = (folderPath: string | null, isSelected: boolean) => {
    const pathKey = folderPath ?? "__no_folder__";
    if (loadingFolder === pathKey) {
      return <Loader2 className="mr-2 h-4 w-4 flex-shrink-0 animate-spin" />;
    }
    if (isSelected) {
      return <Check className="mr-2 h-4 w-4 flex-shrink-0" />;
    }
    return <Folder className="mr-2 h-4 w-4 flex-shrink-0" />;
  };

  const defaultTrigger = (
    <Button
      variant="ghost"
      size="sm"
      className="h-8 gap-2 text-muted-foreground hover:text-foreground max-w-full focus-visible:ring-0 focus-visible:ring-offset-0"
    >
      <Folder className="h-3.5 w-3.5" />
      {value && value !== UNCATEGORIZED && (
        <span className="truncate text-xs max-w-[250px]">{value}</span>
      )}
    </Button>
  );

  return (
    <Popover open={open} onOpenChange={handleOpenChange}>
      <PopoverTrigger asChild onClick={(e) => e.stopPropagation()}>
        {trigger || defaultTrigger}
      </PopoverTrigger>
      <PopoverContent className={cn(width, "p-0")} align={align}>
        <Command>
          <div className="relative [&_[cmdk-input-wrapper]]:pr-10">
            <CommandInput
              placeholder="Search folders..."
              value={searchValue}
              onValueChange={setSearchValue}
              onKeyDown={(e) => {
                if (e.key === "Enter" && isNewFolder) {
                  e.preventDefault();
                  handleSelect(searchValue.trim());
                }
              }}
            />
            <Button
              variant="ghost"
              size="icon"
              className="absolute right-1 top-1/2 -translate-y-1/2 h-7 w-7"
              onClick={() => setShowNewInput(!showNewInput)}
            >
              <Plus className="h-4 w-4" />
            </Button>
          </div>
          {showNewInput && (
            <div className="relative px-3 py-2 border-b">
              <Input
                value={newFolderName}
                onChange={(e) => setNewFolderName(e.target.value)}
                placeholder="New folder name"
                autoFocus
                className="h-8 pr-8"
                onKeyDown={(e) => {
                  if (e.key === "Enter" && newFolderName.trim()) {
                    e.preventDefault();
                    handleCreateFolder();
                  } else if (e.key === "Escape") {
                    setShowNewInput(false);
                    setNewFolderName("");
                  }
                }}
              />
              <CornerDownLeft className="absolute right-5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
            </div>
          )}
          <CommandList>
            <CommandEmpty>
              {isNewFolder ? (
                <button
                  className="w-full px-2 py-1.5 text-left text-sm hover:bg-accent rounded cursor-pointer"
                  onClick={() => handleSelect(searchValue.trim())}
                >
                  Move to &quot;{searchValue}&quot;
                </button>
              ) : (
                "No folders found."
              )}
            </CommandEmpty>
            <CommandGroup className="p-1">
              <CommandItem
                value="__no_folder__"
                onSelect={() => handleSelect(null)}
                className="cursor-pointer px-2 py-1.5"
              >
                {renderFolderIcon(null, !value)}
                <span className={cn(!value && "font-medium")}>No Folder</span>
              </CommandItem>
              {filteredFolders.map((folder) => {
                const isSelected = value === folder.fullPath;
                return (
                  <CommandItem
                    key={folder.fullPath}
                    value={folder.fullPath}
                    onSelect={() => handleSelect(folder.fullPath)}
                    className="cursor-pointer py-1.5"
                    style={{ paddingLeft: `${folder.depth * 12 + 8}px` }}
                  >
                    {renderFolderIcon(folder.fullPath, isSelected)}
                    <span className={cn("truncate", isSelected && "font-medium")}>
                      {folder.name}
                    </span>
                  </CommandItem>
                );
              })}
            </CommandGroup>
            {isNewFolder && filteredFolders.length > 0 && (
              <CommandGroup className="p-1 border-t">
                <CommandItem
                  value={`__create__${searchValue}`}
                  onSelect={() => handleSelect(searchValue.trim())}
                  className="cursor-pointer px-2 py-1.5"
                >
                  <Folder className="mr-2 h-4 w-4 flex-shrink-0" />
                  <span>Move to &quot;{searchValue}&quot;</span>
                </CommandItem>
              </CommandGroup>
            )}
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}
