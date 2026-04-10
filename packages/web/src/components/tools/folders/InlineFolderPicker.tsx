"use client";

import { useUpsertTool } from "@/src/queries/tools";
import { FolderPicker } from "@/src/components/tools/folders/FolderPicker";
import { Tool } from "@superglue/shared";
import { useToast } from "@/src/hooks/use-toast";
import { useState } from "react";

interface InlineFolderPickerProps {
  tool: Tool;
}

export function InlineFolderPicker({ tool }: InlineFolderPickerProps) {
  const upsertTool = useUpsertTool();
  const { toast } = useToast();
  const [open, setOpen] = useState(false);

  const handleFolderChange = async (newFolder: string | null) => {
    upsertTool.mutate(
      { id: tool.id, input: { ...tool, folder: newFolder } },
      {
        onSuccess: () => setOpen(false),
        onError: (error: any) => {
          toast({
            title: "Error moving tool",
            description: error.message || "Failed to change folder",
            variant: "destructive",
          });
        },
      },
    );
  };

  return (
    <FolderPicker
      value={tool.folder}
      onChange={handleFolderChange}
      open={open}
      onOpenChange={setOpen}
    />
  );
}
