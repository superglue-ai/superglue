import { useState } from "react";
import { useConfig } from "@/src/app/config-context";
import { tokenRegistry } from "@/src/lib/token-registry";
import { uploadFileToPresignedUrl } from "@/src/lib/file-upload";

const MAX_FILE_SIZE = 100 * 1024 * 1024; // 100MB

export interface FileUploadOptions {
  onFileProgress?: (fileIndex: number, progress: number) => void;
  onProgress?: (progress: number) => void;
  onError?: (error: Error) => void;
}

export function useFileUpload() {
  const [isUploading, setIsUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const config = useConfig();

  // Simple S3 upload function - expects file references to be already created
  const uploadFiles = async (
    files: File[],
    fileInfos: Array<{
      id: string;
      uploadUrl: string;
      originalFileName: string;
      expiresIn: number;
    }>,
    options?: FileUploadOptions,
  ) => {
    if (files.length !== fileInfos.length) {
      throw new Error("Files and file infos length mismatch");
    }

    if (files.length > 20) {
      throw new Error("Maximum 20 files allowed");
    }

    // Validate file sizes
    const oversizedFiles = files.filter((f) => f.size > MAX_FILE_SIZE);
    if (oversizedFiles.length > 0) {
      throw new Error(
        `File(s) too large: ${oversizedFiles.map((f) => f.name).join(", ")}. Maximum size is 100MB per file.`,
      );
    }

    setIsUploading(true);
    setUploadProgress(0);

    try {
      const fileProgresses = new Array(files.length).fill(0);

      const updateProgress = () => {
        const totalProgress = (fileProgresses.reduce((sum, p) => sum + p, 0) / files.length) * 100;
        setUploadProgress(totalProgress);
        if (options?.onProgress) {
          options.onProgress(totalProgress);
        }
      };

      const uploadPromises = fileInfos.map(async (fileInfo, index) => {
        const file = files[index];
        const contentType = file.type || "application/octet-stream";

        try {
          await uploadFileToPresignedUrl(file, fileInfo.uploadUrl, contentType);

          fileProgresses[index] = 1;

          if (options?.onFileProgress) {
            options.onFileProgress(index, 1);
          }

          updateProgress();
        } catch (uploadError) {
          throw new Error(
            `Unable to upload ${file.name}: ${uploadError instanceof Error ? uploadError.message : "Upload failed"}`,
          );
        }
      });

      await Promise.all(uploadPromises);

      return fileInfos.map((f) => f.id);
    } catch (error) {
      const err =
        error instanceof Error ? error : new Error("Unable to upload files: Unknown error");

      if (options?.onError) {
        options.onError(err);
      }

      throw err;
    } finally {
      setIsUploading(false);
    }
  };

  return {
    uploadFiles,
    isUploading,
    uploadProgress,
  };
}
