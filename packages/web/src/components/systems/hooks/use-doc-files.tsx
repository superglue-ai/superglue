import { useToast } from "@/src/hooks/use-toast";
import {
  formatBytes,
  MAX_TOTAL_FILE_SIZE_DOCUMENTATION,
  sanitizeFileName,
} from "@/src/lib/file-utils";
import type { SuperglueClient } from "@superglue/shared";
import { useCallback, useEffect, useRef, useState } from "react";

export interface DocFile {
  id: string;
  source: "upload" | "scrape" | "openapi";
  status: string;
  fileName: string;
  sourceUrl?: string;
  error?: string;
  content?: string;
  createdAt?: string;
  contentLength?: number;
}

const BLOCKED_DOC_EXTENSIONS = [".zip", ".gz"];
const POLL_TIMEOUT_MS = 5 * 60 * 1000;
const POLL_INTERVAL_MS = 3000;
const MAX_FILES = 10;
const OPENAPI_PATTERNS = /\.(json|yaml|yml)$|openapi|swagger|\/v[23]\//i;

function reconcileFiles(prev: DocFile[], next: DocFile[]): DocFile[] {
  const nextMap = new Map(next.map((f) => [f.id, f]));
  const result: DocFile[] = [];
  let changed = false;

  for (const existing of prev) {
    const updated = nextMap.get(existing.id);
    if (!updated) {
      changed = true;
      continue;
    }
    if (
      existing.status === updated.status &&
      existing.fileName === updated.fileName &&
      existing.error === updated.error &&
      existing.contentLength === updated.contentLength
    ) {
      result.push(existing);
    } else {
      result.push(updated);
      changed = true;
    }
    nextMap.delete(existing.id);
  }

  for (const file of nextMap.values()) {
    result.push(file);
    changed = true;
  }

  if (!changed && result.length === prev.length) return prev;
  return result;
}

export function useDocFiles(systemId: string | undefined, client: SuperglueClient) {
  const { toast } = useToast();

  const [docFiles, setDocFiles] = useState<DocFile[]>([]);
  const [isLoadingDocs, setIsLoadingDocs] = useState(false);
  const [pendingOps, setPendingOps] = useState<Set<string>>(new Set());
  const [deleteTarget, setDeleteTarget] = useState<DocFile | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);
  const [isAddingUrl, setIsAddingUrl] = useState(false);
  const [inlineMessage, setInlineMessage] = useState<string | null>(null);
  const hasFetchedRef = useRef(false);
  const pollStartRef = useRef<number>(0);
  const inlineTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const docFilesRef = useRef<DocFile[]>([]);
  docFilesRef.current = docFiles;

  const showInlineMessage = useCallback((msg: string) => {
    if (inlineTimerRef.current) clearTimeout(inlineTimerRef.current);
    setInlineMessage(msg);
    inlineTimerRef.current = setTimeout(() => setInlineMessage(null), 4000);
  }, []);

  const fetchDocFiles = useCallback(
    async (silent = false) => {
      if (!systemId) return;
      try {
        if (!silent) setIsLoadingDocs(true);
        const result = await client.listSystemFileReferences(systemId);
        setDocFiles((prev) => reconcileFiles(prev, result.files));
        hasFetchedRef.current = true;
      } catch (error: any) {
        console.error("Failed to fetch documentation:", error);
      } finally {
        if (!silent) setIsLoadingDocs(false);
      }
    },
    [systemId, client],
  );

  useEffect(() => {
    fetchDocFiles();
  }, [fetchDocFiles]);

  const hasProcessingFiles =
    pendingOps.size > 0 ||
    docFiles.some((f) => f.status === "PROCESSING" || f.status === "PENDING");

  useEffect(() => {
    if (!hasProcessingFiles) {
      pollStartRef.current = 0;
      return;
    }
    if (!pollStartRef.current) pollStartRef.current = Date.now();

    const interval = setInterval(() => {
      if (Date.now() - pollStartRef.current > POLL_TIMEOUT_MS) {
        clearInterval(interval);
        setPendingOps(new Set());
        return;
      }
      fetchDocFiles(true).then(() => {
        setPendingOps((prev) => {
          const current = docFilesRef.current;
          const still = new Set<string>();
          for (const id of prev) {
            const file = current.find((f) => f.id === id);
            if (!file || file.status === "PROCESSING" || file.status === "PENDING") {
              still.add(id);
            }
          }
          if (still.size === prev.size) return prev;
          return still;
        });
      });
    }, POLL_INTERVAL_MS);

    return () => clearInterval(interval);
  }, [hasProcessingFiles, fetchDocFiles]);

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    if (files.length === 0) return;
    e.target.value = "";

    if (docFiles.length + files.length > MAX_FILES) {
      const remaining = Math.max(0, MAX_FILES - docFiles.length);
      showInlineMessage(
        remaining === 0
          ? `File limit reached (max ${MAX_FILES}) — remove a file first`
          : `Can only add ${remaining} more file${remaining !== 1 ? "s" : ""} (max ${MAX_FILES} total)`,
      );
      return;
    }

    const existingNames = new Set(docFiles.map((f) => f.fileName.toLowerCase()));
    const validFiles: { file: File; uploadName: string }[] = [];

    for (const file of files) {
      const ext = `.${file.name.split(".").pop()?.toLowerCase()}`;
      if (BLOCKED_DOC_EXTENSIONS.includes(ext)) {
        showInlineMessage(`${file.name}: extract archive and upload individual files`);
        continue;
      }
      if (file.size > MAX_TOTAL_FILE_SIZE_DOCUMENTATION) {
        showInlineMessage(
          `${file.name} exceeds ${formatBytes(MAX_TOTAL_FILE_SIZE_DOCUMENTATION)} limit`,
        );
        continue;
      }

      let key = sanitizeFileName(file.name, { removeExtension: false, lowercase: false });
      const dotIdx = key.lastIndexOf(".");
      const base = dotIdx > 0 ? key.slice(0, dotIdx) : key;
      const fileExt = dotIdx > 0 ? key.slice(dotIdx) : "";
      let counter = 1;
      while (existingNames.has(key.toLowerCase())) {
        key = `${base} (${counter})${fileExt}`;
        counter++;
      }
      existingNames.add(key.toLowerCase());
      validFiles.push({ file, uploadName: key });
    }

    if (validFiles.length === 0 || !systemId) return;

    try {
      const fileInfos = await client.createSystemFileUploadUrls(
        systemId,
        validFiles.map((f) => ({
          fileName: f.uploadName,
          contentType: f.file.type || "application/octet-stream",
          contentLength: f.file.size,
        })),
      );

      setDocFiles((prev) => [
        ...prev,
        ...fileInfos.map((info) => ({
          id: info.id,
          source: "upload" as const,
          status: "PENDING",
          fileName: info.originalFileName,
        })),
      ]);
      setPendingOps((prev) => new Set([...prev, ...fileInfos.map((f) => f.id)]));

      const uploadResults = await Promise.allSettled(
        fileInfos.map((info, i) =>
          fetch(info.uploadUrl, {
            method: "PUT",
            body: validFiles[i].file,
            headers: { "Content-Type": validFiles[i].file.type || "application/octet-stream" },
          }).then((res) => {
            if (!res.ok) throw new Error(`Upload failed: ${res.status} ${res.statusText}`);
          }),
        ),
      );

      for (let i = 0; i < uploadResults.length; i++) {
        if (uploadResults[i].status === "rejected") {
          const reason = (uploadResults[i] as PromiseRejectedResult).reason;
          toast({
            title: "Upload failed",
            description: `${validFiles[i].uploadName}: ${reason?.message || "Unknown error"}`,
            variant: "destructive",
          });
        }
      }
    } catch (error: any) {
      toast({
        title: "Upload failed",
        description: error.message || "Failed to create upload URLs",
        variant: "destructive",
      });
    }
  };

  const looksLikeOpenApi = useCallback((url: string) => OPENAPI_PATTERNS.test(url), []);

  const handleAddUrl = (url: string) => {
    if (!url || !systemId) return;

    if (docFiles.length >= MAX_FILES) {
      showInlineMessage(`File limit reached (max ${MAX_FILES}) — remove a file first`);
      return;
    }

    if (docFiles.find((f) => f.sourceUrl?.toLowerCase() === url.toLowerCase())) {
      showInlineMessage("This URL has already been added");
      return;
    }

    setIsAddingUrl(true);
    const tempId = `temp-url-${Date.now()}`;
    const source = looksLikeOpenApi(url) ? "openapi" : "scrape";
    const optimisticCard: DocFile = {
      id: tempId,
      source,
      status: "PENDING",
      fileName: url,
      sourceUrl: url,
    };
    setDocFiles((prev) => [...prev, optimisticCard]);

    const replaceTemp = (real: DocFile) => {
      setDocFiles((prev) => prev.map((f) => (f.id === tempId ? real : f)));
    };
    const removeTemp = () => {
      setDocFiles((prev) => prev.filter((f) => f.id !== tempId));
    };

    const clearAdding = () => setIsAddingUrl(false);

    if (source === "openapi") {
      client
        .fetchOpenApiSpec(systemId, url)
        .then((result) => {
          replaceTemp({
            id: result.fileReferenceId,
            source: "openapi",
            status: "COMPLETED",
            fileName: result.title || url,
            sourceUrl: url,
            createdAt: new Date().toISOString(),
          });
          clearAdding();
        })
        .catch(() =>
          client.triggerSystemDocumentationScrapeJob(systemId, { url }).then(
            (result) => {
              replaceTemp({
                id: result.fileReferenceId,
                source: "scrape",
                status: "PENDING",
                fileName: url,
                sourceUrl: url,
              });
              setPendingOps((prev) => new Set([...prev, result.fileReferenceId]));
              clearAdding();
            },
            (error: any) => {
              removeTemp();
              showInlineMessage(error.message || "Failed to add URL");
              clearAdding();
            },
          ),
        );
    } else {
      client
        .triggerSystemDocumentationScrapeJob(systemId, { url })
        .then((result) => {
          replaceTemp({
            id: result.fileReferenceId,
            source: "scrape",
            status: "PENDING",
            fileName: url,
            sourceUrl: url,
          });
          setPendingOps((prev) => new Set([...prev, result.fileReferenceId]));
          clearAdding();
        })
        .catch((error: any) => {
          removeTemp();
          showInlineMessage(error.message || "Failed to scrape URL");
          clearAdding();
        });
    }
  };

  const handleConfirmDelete = () => {
    if (!deleteTarget || !systemId) return;
    const file = deleteTarget;
    setDeleteTarget(null);
    setDocFiles((prev) => prev.filter((f) => f.id !== file.id));
    setPendingOps((prev) => {
      const next = new Set(prev);
      next.delete(file.id);
      return next;
    });
    client.deleteSystemFileReference(systemId, file.id).catch((error: any) => {
      setDocFiles((prev) => [...prev, file]);
      toast({ title: "Delete failed", description: error.message, variant: "destructive" });
    });
  };

  return {
    docFiles,
    isLoadingDocs,
    hasFetched: hasFetchedRef.current,
    deleteTarget,
    setDeleteTarget,
    isDeleting,
    isAddingUrl,
    inlineMessage,
    looksLikeOpenApi,
    handleFileUpload,
    handleAddUrl,
    handleConfirmDelete,
  };
}
