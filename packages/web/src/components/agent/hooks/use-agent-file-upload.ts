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
  const [pendingFiles, setPendingFiles] = useState<UploadedFile[]>([]);
  const [sessionFiles, setSessionFiles] = useState<UploadedFile[]>([]);
  const [filePayloads, setFilePayloads] = useState<Record<string, any>>({});
  const [isProcessingFiles, setIsProcessingFiles] = useState(false);
  const [isDragging, setIsDragging] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const allFiles = [...sessionFiles, ...pendingFiles];

  const handleFilesUpload = useCallback(
    async (files: File[]) => {
      setIsProcessingFiles(true);

      try {
        const currentPayloadSize = Object.values(filePayloads).reduce((sum, content) => {
          const str = typeof content === "string" ? content : JSON.stringify(content);
          return sum + new Blob([str]).size;
        }, 0);

        const existingKeys = allFiles.map((f) => f.key);
        const newFiles: UploadedFile[] = [];
        const newPayloads: Record<string, any> = {};

        const client = new SuperglueClient({
          endpoint: config.superglueEndpoint,
          apiKey: tokenRegistry.getToken(),
          apiEndpoint: config.apiEndpoint,
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
            setPendingFiles((prev) => [...prev, fileInfo]);

            const parsedData = await processAndExtractFile(file, client);
            newPayloads[key] = parsedData;
            existingKeys.push(key);

            setPendingFiles((prev) =>
              prev.map((f) => (f.key === key ? { ...f, status: "ready" as const } : f)),
            );
          } catch (error: any) {
            const fileInfo = newFiles.find((f) => f.name === file.name);
            if (fileInfo) {
              setPendingFiles((prev) =>
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

        if (currentPayloadSize + batchContentSize > MAX_TOTAL_FILE_SIZE_CHAT) {
          setPendingFiles((prev) => prev.filter((f) => !newFiles.find((nf) => nf.key === f.key)));
          toast({
            title: "Session file limit reached",
            description: `This conversation has ${formatBytes(currentPayloadSize)} of files. To upload more, please start a new chat or remove existing files.`,
            variant: "destructive",
          });
          return;
        }

        setFilePayloads((prev) => ({ ...prev, ...newPayloads }));
      } finally {
        setIsProcessingFiles(false);
      }
    },
    [allFiles, filePayloads, config.superglueEndpoint, toast],
  );

  const handlePendingFileRemove = useCallback((key: string) => {
    setPendingFiles((prev) => prev.filter((f) => f.key !== key));
    setFilePayloads((prev) => {
      const newPayloads = { ...prev };
      delete newPayloads[key];
      return newPayloads;
    });
  }, []);

  const handleSessionFileRemove = useCallback((key: string) => {
    setSessionFiles((prev) => prev.filter((f) => f.key !== key));
    setFilePayloads((prev) => {
      const newPayloads = { ...prev };
      delete newPayloads[key];
      return newPayloads;
    });
  }, []);

  const commitPendingFiles = useCallback(() => {
    const readyFiles = pendingFiles.filter((f) => f.status === "ready");
    const nonReadyFiles = pendingFiles.filter((f) => f.status !== "ready");

    if (readyFiles.length > 0) {
      setSessionFiles((prev) => [...prev, ...readyFiles]);
    }
    // Only clear ready files, keep processing/error files in pending
    setPendingFiles(nonReadyFiles);
  }, [pendingFiles]);

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
    setPendingFiles([]);
    setSessionFiles([]);
    setFilePayloads({});
  }, []);

  return {
    pendingFiles,
    sessionFiles,
    filePayloads,
    setFilePayloads,
    isProcessingFiles,
    isDragging,
    setIsDragging,
    fileInputRef,
    handleFilesUpload,
    handlePendingFileRemove,
    handleSessionFileRemove,
    commitPendingFiles,
    handleDrop,
    handleDragOver,
    handleDragLeave,
    clearFiles,
  };
}
