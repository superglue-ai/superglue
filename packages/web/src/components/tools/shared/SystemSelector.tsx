"use client";

import { useSystems } from "@/src/app/systems-context";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/src/components/ui/select";
import { getSystemIcon as getSystemIconName, getSimpleIcon } from "@/src/lib/general-utils";
import { System } from "@superglue/shared";
import { Globe } from "lucide-react";

interface SystemSelectorProps {
  value: string;
  onValueChange: (value: string, system?: System) => void;
  disabled?: boolean;
  placeholder?: string;
  contentClassName?: string;
  triggerClassName?: string;
  showCreateNew?: boolean;
  onCreateNew?: () => void;
  systems?: System[];
}

export function SystemSelector({
  value,
  onValueChange,
  disabled = false,
  placeholder = "Select system",
  contentClassName,
  triggerClassName = "h-9",
  showCreateNew = false,
  onCreateNew,
  systems: providedSystems,
}: SystemSelectorProps) {
  const { systems: contextSystems } = useSystems();
  const systems = providedSystems || contextSystems;

  const getSystemIcon = (system: System) => {
    const iconName = getSystemIconName(system);
    return iconName ? getSimpleIcon(iconName) : null;
  };

  const handleValueChange = (selectedValue: string) => {
    if (selectedValue === "CREATE_NEW" && onCreateNew) {
      onCreateNew();
    } else {
      const selectedSystem = systems?.find((i) => i.id === selectedValue);
      onValueChange(selectedValue, selectedSystem);
    }
  };

  return (
    <Select value={value} onValueChange={handleValueChange}>
      <SelectTrigger
        className={`${triggerClassName} shadow-none ring-offset-0 focus:ring-0`}
        disabled={disabled}
      >
        <SelectValue placeholder={placeholder} />
      </SelectTrigger>
      <SelectContent className={`${contentClassName} shadow-none`}>
        {systems?.map((system) => {
          const icon = getSystemIcon(system);
          return (
            <SelectItem key={system.id} value={system.id}>
              <div className="flex items-center gap-2 w-full">
                {icon ? (
                  <svg
                    width="16"
                    height="16"
                    viewBox="0 0 24 24"
                    fill={`#${icon.hex}`}
                    className="flex-shrink-0"
                  >
                    <path d={icon.path || ""} />
                  </svg>
                ) : (
                  <Globe className="h-4 w-4 flex-shrink-0 text-muted-foreground" />
                )}
                <span className="flex-grow">{system.id}</span>
                {system.urlHost && (
                  <span className="text-muted-foreground text-xs ml-auto">({system.urlHost})</span>
                )}
              </div>
            </SelectItem>
          );
        })}
        {showCreateNew && onCreateNew && (
          <SelectItem value="CREATE_NEW" className="text-primary">
            + Add New System
          </SelectItem>
        )}
      </SelectContent>
    </Select>
  );
}
