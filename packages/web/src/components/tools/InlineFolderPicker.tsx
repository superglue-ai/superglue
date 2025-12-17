"use client"

import { useConfig } from "@/src/app/config-context";
import { useTools } from "@/src/app/tools-context";
import { FolderPicker } from "@/src/components/tools/FolderPicker";
import { createSuperglueClient } from "@/src/lib/client-utils";
import { Tool } from "@superglue/shared";
import { useToast } from "../../hooks/use-toast";

interface InlineFolderPickerProps {
  tool: Tool;
}

export function InlineFolderPicker({ tool }: InlineFolderPickerProps) {
  const config = useConfig();
  const { refreshTools } = useTools();
  const { toast } = useToast();

  const handleFolderChange = async (newFolder: string | null) => {
    try {
      const client = createSuperglueClient(config.superglueEndpoint);
      await client.upsertWorkflow(tool.id, { ...tool, folder: newFolder });
      refreshTools();
    } catch (error) {
      toast({
        title: "Error updating folder",
        description: error instanceof Error ? error.message : "Failed to update folder",
        variant: "destructive",
      });
      refreshTools();
    }
  };

  return (
    <FolderPicker
      value={tool.folder}
      onChange={handleFolderChange}
    />
  );
}
