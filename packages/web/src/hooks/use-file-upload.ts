import {
    formatBytes,
    generateUniqueKey,
    MAX_TOTAL_FILE_SIZE,
    sanitizeFileName,
    type UploadedFileInfo
} from '@/src/lib/file-utils';
import { SuperglueClient } from '@superglue/client';
import { useState } from 'react';
import { useToast } from './use-toast';

export function useFileUpload(client: SuperglueClient) {
  const { toast } = useToast();
  const [uploadedFiles, setUploadedFiles] = useState<UploadedFileInfo[]>([]);
  const [totalFileSize, setTotalFileSize] = useState(0);
  const [isProcessingFiles, setIsProcessingFiles] = useState(false);
  const [filePayloads, setFilePayloads] = useState<Record<string, any>>({});

  const handleFilesUpload = async (files: File[]) => {
    setIsProcessingFiles(true);

    try {
      // Check total size limit
      const newSize = files.reduce((sum, f) => sum + f.size, 0);
      if (totalFileSize + newSize > MAX_TOTAL_FILE_SIZE) {
        toast({
          title: 'Size limit exceeded',
          description: `Total file size cannot exceed ${formatBytes(MAX_TOTAL_FILE_SIZE)}`,
          variant: 'destructive'
        });
        return;
      }

      const existingKeys = Object.keys(filePayloads);
      const newFiles: UploadedFileInfo[] = [];

      for (const file of files) {
        try {
          // Generate unique key
          const baseKey = sanitizeFileName(file.name);
          const key = generateUniqueKey(baseKey, [...existingKeys, ...newFiles.map(f => f.key)]);

          const fileInfo: UploadedFileInfo = {
            name: file.name,
            size: file.size,
            key,
            status: 'processing'
          };
          newFiles.push(fileInfo);
          setUploadedFiles(prev => [...prev, fileInfo]);

          const extractResult = await client.extract({
            file: file
          });

          if (!extractResult.success) {
            throw new Error(extractResult.error || 'Failed to extract data');
          }
          const parsedData = extractResult.data;
          setFilePayloads(prev => ({ ...prev, [key]: parsedData }));
          existingKeys.push(key);

          setUploadedFiles(prev => prev.map(f =>
            f.key === key ? { ...f, status: 'ready' } : f
          ));

        } catch (error: any) {
          // Update file status with error
          const fileInfo = newFiles.find(f => f.name === file.name);
          if (fileInfo) {
            setUploadedFiles(prev => prev.map(f =>
              f.key === fileInfo.key
                ? { ...f, status: 'error', error: error.message }
                : f
            ));
          }

          toast({
            title: 'File processing failed',
            description: `Failed to parse ${file.name}: ${error.message}`,
            variant: 'destructive'
          });
        }
      }
      setTotalFileSize(prev => prev + newSize);

    } finally {
      setIsProcessingFiles(false);
    }
  };

  const handleFileRemove = (key: string) => {
    // Find the file to remove
    const fileToRemove = uploadedFiles.find(f => f.key === key);
    if (!fileToRemove) return;

    // Update file payloads map
    setFilePayloads(prev => {
      const copy = { ...prev };
      delete copy[key];
      return copy;
    });

    // Update files list and total size
    setUploadedFiles(prev => prev.filter(f => f.key !== key));
    setTotalFileSize(prev => Math.max(0, prev - fileToRemove.size));
  };

  return {
    uploadedFiles,
    totalFileSize,
    isProcessingFiles,
    filePayloads,
    handleFilesUpload,
    handleFileRemove,
    setUploadedFiles,
    setTotalFileSize,
    setFilePayloads,
  };
}

