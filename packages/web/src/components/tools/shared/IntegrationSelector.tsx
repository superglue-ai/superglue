"use client";

import { useIntegrations } from "@/src/app/integrations-context";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/src/components/ui/select";
import {
  getIntegrationIcon as getIntegrationIconName,
  getSimpleIcon,
} from "@/src/lib/general-utils";
import { Integration } from "@superglue/shared";
import { Globe } from "lucide-react";

interface IntegrationSelectorProps {
  value: string;
  onValueChange: (value: string, integration?: Integration) => void;
  disabled?: boolean;
  placeholder?: string;
  contentClassName?: string;
  triggerClassName?: string;
  showCreateNew?: boolean;
  onCreateNew?: () => void;
  integrations?: Integration[];
}

export function IntegrationSelector({
  value,
  onValueChange,
  disabled = false,
  placeholder = "Select integration",
  contentClassName,
  triggerClassName = "h-9",
  showCreateNew = false,
  onCreateNew,
  integrations: providedIntegrations,
}: IntegrationSelectorProps) {
  const { integrations: contextIntegrations } = useIntegrations();
  const integrations = providedIntegrations || contextIntegrations;

  const getIntegrationIcon = (integration: Integration) => {
    const iconName = getIntegrationIconName(integration);
    return iconName ? getSimpleIcon(iconName) : null;
  };

  const handleValueChange = (selectedValue: string) => {
    if (selectedValue === "CREATE_NEW" && onCreateNew) {
      onCreateNew();
    } else {
      const selectedIntegration = integrations?.find((i) => i.id === selectedValue);
      onValueChange(selectedValue, selectedIntegration);
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
        {integrations?.map((integration) => {
          const icon = getIntegrationIcon(integration);
          return (
            <SelectItem key={integration.id} value={integration.id}>
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
                <span className="flex-grow">{integration.id}</span>
                {integration.urlHost && (
                  <span className="text-muted-foreground text-xs ml-auto">
                    ({integration.urlHost})
                  </span>
                )}
              </div>
            </SelectItem>
          );
        })}
        {showCreateNew && onCreateNew && (
          <SelectItem value="CREATE_NEW" className="text-primary">
            + Add New Integration
          </SelectItem>
        )}
      </SelectContent>
    </Select>
  );
}
