"use client";

import { ALLOWED_FILE_EXTENSIONS } from "@superglue/shared";
import { isAllowedFileType } from "@/src/lib/file-utils";
import { Loader2, Upload } from "lucide-react";
import { useRef, useState } from "react";
import { cn } from "@/src/lib/general-utils";
import { useToast } from "@/src/hooks/use-toast";
import JSZip from "jszip";
import pako from "pako";

// Archive detection helpers
const isZipFile = (file: File) =>
  file.name.toLowerCase().endsWith(".zip") || file.type === "application/zip";

const isTarGzFile = (file: File) =>
  file.name.toLowerCase().endsWith(".tar.gz") || file.name.toLowerCase().endsWith(".tgz");

// Extract .zip files
const extractZipFiles = async (zipFile: File): Promise<File[]> => {
  const zip = await JSZip.loadAsync(zipFile);
  const extractedFiles: File[] = [];

  for (const [path, zipEntry] of Object.entries(zip.files)) {
    if (zipEntry.dir) continue;
    const filename = path.split("/").pop() || "";
    if (filename.startsWith(".") || path.includes("__MACOSX")) continue;
    if (!isAllowedFileType(filename)) continue;

    const blob = await zipEntry.async("blob");
    extractedFiles.push(
      new File([blob], filename, { type: blob.type || "application/octet-stream" }),
    );
  }
  return extractedFiles;
};

// Simple tar parser (tar format is 512-byte blocks)
const parseTar = (data: Uint8Array): File[] => {
  const files: File[] = [];
  let offset = 0;

  while (offset < data.length - 512) {
    const header = data.slice(offset, offset + 512);
    if (header.every((b) => b === 0)) break; // End of archive

    const name = new TextDecoder().decode(header.slice(0, 100)).replace(/\0/g, "").trim();
    const sizeOctal = new TextDecoder().decode(header.slice(124, 136)).replace(/\0/g, "").trim();
    const size = parseInt(sizeOctal, 8) || 0;
    const typeFlag = header[156];

    offset += 512; // Move past header

    if (typeFlag === 0 || typeFlag === 48) {
      // Regular file (0 or '0')
      const filename = name.split("/").pop() || "";
      if (filename && !filename.startsWith(".") && isAllowedFileType(filename)) {
        const content = data.slice(offset, offset + size);
        files.push(new File([content], filename, { type: "application/octet-stream" }));
      }
    }

    offset += Math.ceil(size / 512) * 512; // Move to next header (512-byte aligned)
  }
  return files;
};

// Extract .tar.gz files
const extractTarGzFiles = async (tarGzFile: File): Promise<File[]> => {
  const arrayBuffer = await tarGzFile.arrayBuffer();
  const decompressed = pako.ungzip(new Uint8Array(arrayBuffer));
  return parseTar(decompressed);
};

interface FileUploadZoneProps {
  onFilesSelected: (files: File[]) => void;
  maxFiles?: number;
  className?: string;
}

export function FileUploadZone({ onFilesSelected, maxFiles = 20, className }: FileUploadZoneProps) {
  const [isDragging, setIsDragging] = useState(false);
  const [isExtracting, setIsExtracting] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const { toast } = useToast();

  const validateFiles = (files: File[]): { valid: File[]; errors: string[] } => {
    const valid: File[] = [];
    const errors: string[] = [];

    for (const file of files) {
      if (!isAllowedFileType(file.name)) {
        errors.push(
          `${file.name}: File type not allowed. Allowed types: ${ALLOWED_FILE_EXTENSIONS.join(", ")}`,
        );
        continue;
      }
      valid.push(file);
    }

    if (valid.length > maxFiles) {
      errors.push(
        `Maximum ${maxFiles} files allowed. Only the first ${maxFiles} files will be added.`,
      );
      return { valid: valid.slice(0, maxFiles), errors };
    }

    return { valid, errors };
  };

  const handleFiles = async (files: FileList | null) => {
    if (!files || files.length === 0) return;

    setIsExtracting(true);
    try {
      const processedFiles: File[] = [];

      for (const file of Array.from(files)) {
        if (isZipFile(file)) {
          try {
            const extracted = await extractZipFiles(file);
            if (extracted.length === 0) {
              toast({
                title: "Empty archive",
                description: `${file.name} contains no supported files`,
                variant: "destructive",
              });
            } else {
              processedFiles.push(...extracted);
            }
          } catch (e) {
            toast({
              title: "Failed to extract archive",
              description: file.name,
              variant: "destructive",
            });
          }
        } else if (isTarGzFile(file)) {
          try {
            const extracted = await extractTarGzFiles(file);
            if (extracted.length === 0) {
              toast({
                title: "Empty archive",
                description: `${file.name} contains no supported files`,
                variant: "destructive",
              });
            } else {
              processedFiles.push(...extracted);
            }
          } catch (e) {
            toast({
              title: "Failed to extract archive",
              description: file.name,
              variant: "destructive",
            });
          }
        } else {
          processedFiles.push(file);
        }
      }

      const { valid, errors } = validateFiles(processedFiles);

      if (errors.length > 0) {
        // Show first error via toast
        toast({
          title: "File validation error",
          description: errors[0],
          variant: "destructive",
        });
      }

      if (valid.length > 0) {
        onFilesSelected(valid);
      }
    } finally {
      setIsExtracting(false);
    }
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(true);
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
    void handleFiles(e.dataTransfer.files);
  };

  const handleClick = () => {
    if (isExtracting) return;
    fileInputRef.current?.click();
  };

  const handleFileInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    void handleFiles(e.target.files);
    // Reset input so same file can be selected again
    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }
  };

  return (
    <div
      className={cn(
        "border-2 border-dashed rounded-lg p-8 text-center cursor-pointer transition-colors bg-muted/30 flex flex-col items-center justify-center",
        isExtracting && "pointer-events-none opacity-70",
        isDragging
          ? "border-primary bg-primary/10"
          : "border-muted-foreground/25 hover:border-muted-foreground/50 hover:bg-muted/40",
        className,
      )}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
      onClick={handleClick}
    >
      <input
        ref={fileInputRef}
        type="file"
        multiple
        accept={ALLOWED_FILE_EXTENSIONS.join(",")}
        onChange={handleFileInputChange}
        className="hidden"
        disabled={isExtracting}
      />
      <div className="w-16 h-16 rounded-full bg-primary/10 flex items-center justify-center mx-auto mb-4">
        {isExtracting ? (
          <Loader2 className="h-8 w-8 text-primary animate-spin" />
        ) : (
          <Upload className="h-8 w-8 text-primary" />
        )}
      </div>
      <p className="text-sm font-medium mb-2">
        {isExtracting
          ? "Extracting archive..."
          : isDragging
            ? "Drop files here"
            : "Drag & drop files here, or click to select"}
      </p>
      <p className="text-xs text-muted-foreground">
        Supported formats: {ALLOWED_FILE_EXTENSIONS.join(", ")}
      </p>
      <p className="text-xs text-muted-foreground mt-1">Maximum {maxFiles} files</p>
    </div>
  );
}
