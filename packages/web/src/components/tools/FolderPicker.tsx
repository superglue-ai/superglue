"use client"

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
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/src/components/ui/popover";
import { cn } from "@/src/lib/general-utils";
import { Check, Folder } from "lucide-react";
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
}

export function FolderPicker({ 
  value, 
  onChange, 
  trigger,
  disabled,
  align = "start",
  width = "w-[250px]"
}: FolderPickerProps) {
  const { tools } = useTools();
  const [open, setOpen] = useState(false);
  const [searchValue, setSearchValue] = useState("");

  const defaultTrigger = (
    <Button
      variant="ghost"
      size="sm"
      className="h-8 gap-2 text-muted-foreground hover:text-foreground max-w-full focus-visible:ring-0 focus-visible:ring-offset-0"
    >
      <Folder className="h-3.5 w-3.5" />
      {value && value !== UNCATEGORIZED ? <span className="truncate text-xs max-w-[250px]">{value}</span> : null}
    </Button>
  );

  const flatFolders = useMemo(() => {
    const fromTools = tools.map(t => t.folder).filter(Boolean) as string[];
    const uniqueFolders = Array.from(new Set([...fromTools, ...(value ? [value] : [])])).sort();
    const flatList: FolderNode[] = [];
    const processedPaths = new Set<string>();

    uniqueFolders.forEach(folderPath => {
      const parts = folderPath.split('/');
      let currentPath = '';
      
      parts.forEach((part, index) => {
        currentPath = index === 0 ? part : `${currentPath}/${part}`;
        
        if (!processedPaths.has(currentPath)) {
          processedPaths.add(currentPath);
          flatList.push({
            name: part,
            fullPath: currentPath,
            depth: index,
          });
        }
      });
    });

    return flatList;
  }, [tools, value]);

  const allFolderPaths = useMemo(() => 
    flatFolders.map(f => f.fullPath)
  , [flatFolders]);

  const filteredFolders = useMemo(() => {
    if (!searchValue) return flatFolders;
    const lower = searchValue.toLowerCase();
    return flatFolders.filter(f => f.fullPath.toLowerCase().includes(lower));
  }, [flatFolders, searchValue]);

  const showCreateOption = searchValue.trim() && 
    !allFolderPaths.some(f => f.toLowerCase() === searchValue.toLowerCase());

  const handleSelect = (folder: string | null) => {
    onChange(folder);
    setOpen(false);
    setSearchValue("");
  };

  return (
    <Popover open={open} onOpenChange={(isOpen) => {
      if (!disabled) {
        setOpen(isOpen);
        if (!isOpen) setSearchValue("");
      }
    }}>
      <PopoverTrigger asChild onClick={(e) => e.stopPropagation()}>
        {trigger || defaultTrigger}
      </PopoverTrigger>
      <PopoverContent className={cn(width, "p-0")} align={align}>
        <Command>
          <CommandInput
            placeholder="Search or create folder..."
            value={searchValue}
            onValueChange={setSearchValue}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                e.stopPropagation();
                if (showCreateOption) {
                  handleSelect(searchValue.trim());
                }
              }
            }}
          />
          <CommandList>
            <CommandEmpty>
              {showCreateOption ? (
                <button
                  className="w-full px-2 py-1.5 text-left text-sm hover:bg-accent rounded cursor-pointer"
                  onClick={() => handleSelect(searchValue.trim())}
                >
                  Create &quot;{searchValue}&quot;
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
                {!value ? (
                  <Check className="mr-2 h-4 w-4 flex-shrink-0" />
                ) : (
                  <Folder className="mr-2 h-4 w-4 flex-shrink-0" />
                )}
                <span className={cn(!value && "font-medium")}>
                  No Folder
                </span>
              </CommandItem>
              {filteredFolders.map((folder) => {
                const isSelected = value === folder.fullPath;
                return (
                  <CommandItem
                    key={folder.fullPath}
                    value={folder.fullPath}
                    onSelect={() => handleSelect(folder.fullPath)}
                    className="cursor-pointer py-1.5"
                    style={{ paddingLeft: `${(folder.depth * 12) + 8}px` }}
                  >
                    {isSelected ? (
                      <Check className="mr-2 h-4 w-4 flex-shrink-0" />
                    ) : (
                      <Folder className="mr-2 h-4 w-4 flex-shrink-0" />
                    )}
                    <span className={cn("truncate", isSelected && "font-medium")}>{folder.name}</span>
                  </CommandItem>
                );
              })}
            </CommandGroup>
            {showCreateOption && filteredFolders.length > 0 && (
              <CommandGroup className="p-1 border-t">
                <CommandItem
                  value={`__create__${searchValue}`}
                  onSelect={() => handleSelect(searchValue.trim())}
                  className="cursor-pointer px-2 py-1.5"
                >
                  <Folder className="mr-2 h-4 w-4 flex-shrink-0" />
                  <span>Create &quot;{searchValue}&quot;</span>
                </CommandItem>
              </CommandGroup>
            )}
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}

