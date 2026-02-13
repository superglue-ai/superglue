import type { SuperglueClient } from "@superglue/shared";
import { useCallback, useRef, useState } from "react";
import type { DocFile } from "./use-doc-files";

const MAX_CACHE_BYTES = 20 * 1024 * 1024;

export function useFilePreview(client: SuperglueClient) {
  const [previewFile, setPreviewFile] = useState<DocFile | null>(null);
  const [previewContent, setPreviewContent] = useState<string | null>(null);
  const [previewLoading, setPreviewLoading] = useState(false);
  const contentCacheRef = useRef<Map<string, string>>(new Map());
  const loadingForIdRef = useRef<string | null>(null);

  const evictCache = useCallback((skipId?: string) => {
    let totalBytes = 0;
    const entries = Array.from(contentCacheRef.current.entries());
    for (const [, v] of entries) totalBytes += v.length;
    while (totalBytes > MAX_CACHE_BYTES && entries.length > 0) {
      const oldest = entries.shift()!;
      if (oldest[0] === skipId) continue;
      contentCacheRef.current.delete(oldest[0]);
      totalBytes -= oldest[1].length;
    }
  }, []);

  const loadContent = useCallback(
    async (fileId: string): Promise<string | null> => {
      if (contentCacheRef.current.has(fileId)) {
        return contentCacheRef.current.get(fileId) || null;
      }
      try {
        const content = await client.getFileReferenceContent(fileId);
        if (content) {
          contentCacheRef.current.set(fileId, content);
          evictCache(fileId);
        }
        return content;
      } catch {
        return null;
      }
    },
    [client, evictCache],
  );

  const handlePreview = useCallback(
    async (file: DocFile) => {
      loadingForIdRef.current = file.id;
      setPreviewFile(file);
      setPreviewContent(null);
      setPreviewLoading(true);
      const content = await loadContent(file.id);
      if (loadingForIdRef.current === file.id) {
        setPreviewContent(content);
        setPreviewLoading(false);
      }
    },
    [loadContent],
  );

  const closePreview = useCallback(() => {
    loadingForIdRef.current = null;
    setPreviewFile(null);
    setPreviewContent(null);
  }, []);

  return {
    previewFile,
    previewContent,
    previewLoading,
    handlePreview,
    closePreview,
  };
}
