import { useState, useCallback } from "react";
import { useConfig } from "@/src/app/config-context";
import { useToast } from "@/src/hooks/use-toast";
import { createSuperglueClient } from "@/src/lib/client-utils";
import {
  formatBytes,
  generateUniqueKey,
  MAX_TOTAL_FILE_SIZE_TOOLS,
  processAndExtractFile,
  sanitizeFileName,
  type UploadedFileInfo,
} from "@/src/lib/file-utils";
import { removeFileKeysFromPayload } from "@/src/lib/general-utils";

interface UseFileUploadOptions {
  maxTotalSize?: number;
  onFilesChange?: (files: UploadedFileInfo[], payloads: Record<string, any>) => void;
  onPayloadTextUpdate?: (updater: (prev: string) => string) => void;
  onUserEdit?: () => void;
}

interface UseFileUploadReturn {
  uploadedFiles: UploadedFileInfo[];
  filePayloads: Record<string, any>;
  totalFileSize: number;
  isProcessing: boolean;
  uploadFiles: (files: File[]) => Promise<void>;
  removeFile: (key: string) => void;
  setUploadedFiles: (files: UploadedFileInfo[]) => void;
  setFilePayloads: (payloads: Record<string, any>) => void;
}

export function useFileUpload(options: UseFileUploadOptions = {}): UseFileUploadReturn {
  const {
    maxTotalSize = MAX_TOTAL_FILE_SIZE_TOOLS,
    onFilesChange,
    onPayloadTextUpdate,
    onUserEdit,
  } = options;

  const config = useConfig();
  const { toast } = useToast();

  const [uploadedFiles, setUploadedFiles] = useState<UploadedFileInfo[]>([]);
  const [filePayloads, setFilePayloads] = useState<Record<string, any>>({});
  const [isProcessing, setIsProcessing] = useState(false);

  const totalFileSize = uploadedFiles.reduce((sum, f) => sum + (f.size || 0), 0);

  const uploadFiles = useCallback(
    async (files: File[]) => {
      setIsProcessing(true);
      onUserEdit?.();

      try {
        const newSize = files.reduce((sum, f) => sum + f.size, 0);
        if (totalFileSize + newSize > maxTotalSize) {
          toast({
            title: "Size limit exceeded",
            description: `Total file size cannot exceed ${formatBytes(maxTotalSize)}`,
            variant: "destructive",
          });
          return;
        }

        const existingKeys = uploadedFiles.map((f) => f.key);
        const newFiles: UploadedFileInfo[] = [];
        const newPayloads: Record<string, any> = { ...filePayloads };
        const keysToRemove: string[] = [];

        for (const file of files) {
          const baseKey = sanitizeFileName(file.name, { removeExtension: true, lowercase: false });
          const key = generateUniqueKey(baseKey, [...existingKeys, ...newFiles.map((f) => f.key)]);

          const fileInfo: UploadedFileInfo = {
            name: file.name,
            size: file.size,
            key,
            status: "processing",
          };
          newFiles.push(fileInfo);
          existingKeys.push(key);

          try {
            const client = createSuperglueClient(config.superglueEndpoint);
            const parsedData = await processAndExtractFile(file, client);

            newPayloads[key] = parsedData;
            fileInfo.status = "ready";
            keysToRemove.push(key);
          } catch (error: any) {
            fileInfo.status = "error";
            fileInfo.error = error.message;

            toast({
              title: "File processing failed",
              description: `Failed to parse ${file.name}: ${error.message}`,
              variant: "destructive",
            });
          }
        }

        const finalFiles = [...uploadedFiles, ...newFiles];

        if (onFilesChange) {
          onFilesChange(finalFiles, newPayloads);
        } else {
          setUploadedFiles(finalFiles);
          setFilePayloads(newPayloads);
        }

        if (keysToRemove.length > 0 && onPayloadTextUpdate) {
          onPayloadTextUpdate((prev) => removeFileKeysFromPayload(prev, keysToRemove));
        }
      } finally {
        setIsProcessing(false);
      }
    },
    [
      uploadedFiles,
      filePayloads,
      totalFileSize,
      maxTotalSize,
      config.superglueEndpoint,
      toast,
      onFilesChange,
      onPayloadTextUpdate,
      onUserEdit,
    ],
  );

  const removeFile = useCallback(
    (key: string) => {
      const fileToRemove = uploadedFiles.find((f) => f.key === key);
      if (!fileToRemove) return;

      const newFiles = uploadedFiles.filter((f) => f.key !== key);
      const newPayloads = { ...filePayloads };
      delete newPayloads[key];

      if (onFilesChange) {
        onFilesChange(newFiles, newPayloads);
      } else {
        setUploadedFiles(newFiles);
        setFilePayloads(newPayloads);
      }
    },
    [uploadedFiles, filePayloads, onFilesChange],
  );

  return {
    uploadedFiles,
    filePayloads,
    totalFileSize,
    isProcessing,
    uploadFiles,
    removeFile,
    setUploadedFiles,
    setFilePayloads,
  };
}
