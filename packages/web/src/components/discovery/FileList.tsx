"use client";

import { FileChip } from "@/src/components/ui/file-chip";
import type { UploadedFileInfo } from "@/src/lib/file-utils";

interface FileListProps {
  files: File[];
  onRemove: (index: number) => void;
}

export function FileList({ files, onRemove }: FileListProps) {
  return (
    <div className="space-y-2">
      <div className="text-sm text-muted-foreground">
        {files.length} file{files.length !== 1 ? "s" : ""} selected
      </div>
      <div className="max-h-60 overflow-y-auto space-y-2">
        {files.map((file, index) => {
          const fileInfo: UploadedFileInfo = {
            key: `${file.name}-${index}`,
            name: file.name,
            size: file.size,
            status: "ready",
          };

          return (
            <FileChip
              key={`${file.name}-${index}`}
              file={fileInfo}
              onRemove={() => onRemove(index)}
              showOriginalName={true}
              showSize={true}
            />
          );
        })}
      </div>
    </div>
  );
}
