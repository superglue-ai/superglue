"use client";

import { useConfig } from "@/src/app/config-context";
import { useTools } from "@/src/app/tools-context";
import { FolderPicker } from "@/src/components/tools/folders/FolderPicker";
import { createSuperglueClient } from "@/src/lib/client-utils";
import { Tool } from "@superglue/shared";
import { useToast } from "@/src/hooks/use-toast";
import { useState } from "react";

interface InlineFolderPickerProps {
  tool: Tool;
}

export function InlineFolderPicker({ tool }: InlineFolderPickerProps) {
  const config = useConfig();
  const { refreshTools } = useTools();
  const { toast } = useToast();
  const [open, setOpen] = useState(false);
  const [loadingFolder, setLoadingFolder] = useState<string | null>(null);

  const handleFolderChange = async (newFolder: string | null) => {
    const folderKey = newFolder ?? "__no_folder__";
    setLoadingFolder(folderKey);

    try {
      const client = createSuperglueClient(config.superglueEndpoint, config.apiEndpoint);
      await client.upsertWorkflow(tool.id, { ...tool, folder: newFolder });
      refreshTools();
      setOpen(false);
    } catch (error) {
      toast({
        title: "Error updating folder",
        description: error instanceof Error ? error.message : "Failed to update folder",
        variant: "destructive",
      });
      refreshTools();
    } finally {
      setLoadingFolder(null);
    }
  };

  return (
    <FolderPicker
      value={tool.folder}
      onChange={handleFolderChange}
      open={open}
      onOpenChange={setOpen}
      loadingFolder={loadingFolder}
    />
  );
}
