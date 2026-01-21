"use client";

import { useConfig } from "@/src/app/config-context";
import {
  formatBytes,
  generateUniqueKey,
  MAX_TOTAL_FILE_SIZE_CHAT,
  processAndExtractFile,
  sanitizeFileName,
} from "@/src/lib/file-utils";
import { tokenRegistry } from "@/src/lib/token-registry";
import { SuperglueClient } from "@superglue/shared";
import { useCallback, useRef, useState } from "react";
import type { UploadedFile, UseAgentFileUploadReturn } from "./types";

interface UseAgentFileUploadOptions {
  toast: (options: { title: string; description: string; variant?: "destructive" }) => void;
}

export function useAgentFileUpload({ toast }: UseAgentFileUploadOptions): UseAgentFileUploadReturn {
  const config = useConfig();
  const [uploadedFiles, setUploadedFiles] = useState<UploadedFile[]>([]);
  const [filePayloads, setFilePayloads] = useState<Record<string, any>>({});
  const [isProcessingFiles, setIsProcessingFiles] = useState(false);
  const [isDragging, setIsDragging] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFilesUpload = useCallback(
    async (files: File[]) => {
      setIsProcessingFiles(true);

      try {
        const currentTotalSize = uploadedFiles.reduce((sum, f) => sum + (f.size || 0), 0);
        const newSize = files.reduce((sum, f) => sum + f.size, 0);

        if (currentTotalSize + newSize > MAX_TOTAL_FILE_SIZE_CHAT) {
          toast({
            title: "Size limit exceeded",
            description: `Total file size cannot exceed ${formatBytes(MAX_TOTAL_FILE_SIZE_CHAT)} for chat uploads`,
            variant: "destructive",
          });
          return;
        }

        const existingKeys = uploadedFiles.map((f) => f.key);
        const newFiles: UploadedFile[] = [];
        const newPayloads: Record<string, any> = {};

        const client = new SuperglueClient({
          endpoint: config.superglueEndpoint,
          apiKey: tokenRegistry.getToken(),
        });

        for (const file of files) {
          try {
            const baseKey = sanitizeFileName(file.name, {
              removeExtension: true,
              lowercase: false,
            });
            const key = generateUniqueKey(baseKey, [
              ...existingKeys,
              ...newFiles.map((f) => f.key),
            ]);

            const fileInfo: UploadedFile = {
              name: file.name,
              size: file.size,
              key,
              status: "processing",
            };
            newFiles.push(fileInfo);
            setUploadedFiles((prev) => [...prev, fileInfo]);

            const parsedData = await processAndExtractFile(file, client);
            newPayloads[key] = parsedData;
            existingKeys.push(key);

            setUploadedFiles((prev) =>
              prev.map((f) => (f.key === key ? { ...f, status: "ready" as const } : f)),
            );
          } catch (error: any) {
            const fileInfo = newFiles.find((f) => f.name === file.name);
            if (fileInfo) {
              setUploadedFiles((prev) =>
                prev.map((f) =>
                  f.key === fileInfo.key
                    ? { ...f, status: "error" as const, error: error.message }
                    : f,
                ),
              );
            }

            toast({
              title: "File processing failed",
              description: `Failed to parse ${file.name}: ${error.message}`,
              variant: "destructive",
            });
          }
        }

        const batchContentSize = Object.values(newPayloads).reduce((sum, content) => {
          const str = typeof content === "string" ? content : JSON.stringify(content);
          return sum + new Blob([str]).size;
        }, 0);

        const currentPayloadSize = Object.values(filePayloads).reduce((sum, content) => {
          const str = typeof content === "string" ? content : JSON.stringify(content);
          return sum + new Blob([str]).size;
        }, 0);

        if (currentPayloadSize + batchContentSize > MAX_TOTAL_FILE_SIZE_CHAT) {
          setUploadedFiles((prev) => prev.filter((f) => !newFiles.find((nf) => nf.key === f.key)));
          toast({
            title: "Upload batch too large",
            description: `Total extracted content (${formatBytes(batchContentSize)}) exceeds 50 MB limit. Try uploading fewer or smaller files.`,
            variant: "destructive",
          });
          return;
        }

        setFilePayloads((prev) => ({ ...prev, ...newPayloads }));
      } finally {
        setIsProcessingFiles(false);
      }
    },
    [uploadedFiles, filePayloads, config.superglueEndpoint, toast],
  );

  const handleFileRemove = useCallback((key: string) => {
    setUploadedFiles((prev) => prev.filter((f) => f.key !== key));
    setFilePayloads((prev) => {
      const newPayloads = { ...prev };
      delete newPayloads[key];
      return newPayloads;
    });
  }, []);

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      setIsDragging(false);

      const files = Array.from(e.dataTransfer.files) as File[];
      if (files.length > 0) {
        handleFilesUpload(files);
      }
    },
    [handleFilesUpload],
  );

  const handleDragOver = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      if (!isDragging) {
        setIsDragging(true);
      }
    },
    [isDragging],
  );

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    if (e.currentTarget === e.target) {
      setIsDragging(false);
    }
  }, []);

  const clearFiles = useCallback(() => {
    setUploadedFiles([]);
    setFilePayloads({});
  }, []);

  return {
    uploadedFiles,
    setUploadedFiles,
    filePayloads,
    setFilePayloads,
    isProcessingFiles,
    isDragging,
    setIsDragging,
    fileInputRef,
    handleFilesUpload,
    handleFileRemove,
    handleDrop,
    handleDragOver,
    handleDragLeave,
    clearFiles,
  };
}
