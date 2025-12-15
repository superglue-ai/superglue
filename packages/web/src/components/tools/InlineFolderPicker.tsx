"use client"

import { useConfig } from "@/src/app/config-context";
import { useTools } from "@/src/app/tools-context";
import { FolderPicker, UNCATEGORIZED } from "@/src/components/tools/FolderPicker";
import { Button } from "@/src/components/ui/button";
import { createSuperglueClient } from "@/src/lib/client-utils";
import { Tool } from "@superglue/shared";
import { Folder } from "lucide-react";

interface InlineFolderPickerProps {
  tool: Tool;
}

export function InlineFolderPicker({ tool }: InlineFolderPickerProps) {
  const config = useConfig();
  const { refreshTools } = useTools();

  const handleFolderChange = async (newFolder: string | null) => {
    try {
      const client = createSuperglueClient(config.superglueEndpoint);
      await client.upsertWorkflow(tool.id, { ...tool, folder: newFolder });
      refreshTools();
    } catch (error) {
      console.error("Failed to update folder:", error);
    }
  };

  return (
    <FolderPicker
      value={tool.folder}
      onChange={handleFolderChange}
      trigger={
        <Button
          variant="ghost"
          size="sm"
          className="h-8 gap-1.5 text-muted-foreground hover:text-foreground max-w-full"
        >
          <Folder className="h-3.5 w-3.5" />
          <span className="truncate text-xs max-w-[150px]">{tool.folder || UNCATEGORIZED}</span>
        </Button>
      }
    />
  );
}
