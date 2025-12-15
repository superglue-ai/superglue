"use client"

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

export const UNCATEGORIZED = "Uncategorized";

interface FolderPickerProps {
  value: string | undefined;
  onChange: (folder: string | null) => void;
  folders: string[];
  trigger: React.ReactNode;
  disabled?: boolean;
  align?: "start" | "center" | "end";
  width?: string;
}

export function FolderPicker({ 
  value, 
  onChange, 
  folders, 
  trigger,
  disabled,
  align = "start",
  width = "w-[250px]"
}: FolderPickerProps) {
  const [open, setOpen] = useState(false);
  const [searchValue, setSearchValue] = useState("");

  const filteredFolders = useMemo(() => {
    if (!searchValue) return folders;
    const lower = searchValue.toLowerCase();
    return folders.filter(f => f.toLowerCase().includes(lower));
  }, [folders, searchValue]);

  const showCreateOption = searchValue.trim() && 
    !folders.some(f => f.toLowerCase() === searchValue.toLowerCase());

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
        {trigger}
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
                value={UNCATEGORIZED}
                onSelect={() => handleSelect(null)}
                className="cursor-pointer px-2 py-1.5"
              >
                {!value ? (
                  <Check className="mr-2 h-4 w-4 flex-shrink-0" />
                ) : (
                  <Folder className="mr-2 h-4 w-4 flex-shrink-0" />
                )}
                <span className={cn(!value && "font-medium")}>
                  {UNCATEGORIZED}
                </span>
              </CommandItem>
              {filteredFolders.map((folder) => {
                const isSelected = value === folder;
                return (
                  <CommandItem
                    key={folder}
                    value={folder}
                    onSelect={() => handleSelect(folder)}
                    className="cursor-pointer px-2 py-1.5"
                  >
                    {isSelected ? (
                      <Check className="mr-2 h-4 w-4 flex-shrink-0" />
                    ) : (
                      <Folder className="mr-2 h-4 w-4 flex-shrink-0" />
                    )}
                    <span className={cn("truncate", isSelected && "font-medium")}>{folder}</span>
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

