"use client"

import { useConfig } from "@/src/app/config-context";
import { useTools } from "@/src/app/tools-context";
import { FolderPicker, UNCATEGORIZED } from "@/src/components/tools/FolderPicker";
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
        <button className="flex items-center gap-1.5 text-muted-foreground px-2 py-1 rounded-md hover:text-foreground transition-colors cursor-pointer max-w-full">
          <Folder className="h-3.5 w-3.5 flex-shrink-0" />
          <span className="truncate text-sm max-w-[150px]">{tool.folder || UNCATEGORIZED}</span>
        </button>
      }
    />
  );
}
