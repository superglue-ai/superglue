import { useToast } from "@/src/hooks/use-toast";
import {
  formatBytes,
  MAX_TOTAL_FILE_SIZE_DOCUMENTATION,
  sanitizeFileName,
} from "@/src/lib/file-utils";
import {
  useDocFilesQuery,
  useUploadDocFiles,
  useAddDocUrl,
  useDeleteDocFile,
  type DocFile,
} from "@/src/queries/doc-files";
import { useQueryClient } from "@tanstack/react-query";
import { queryKeys } from "@/src/queries/query-keys";
import { useOrg } from "@/src/app/org-context";
import { useCallback, useRef, useState } from "react";

export type { DocFile } from "@/src/queries/doc-files";

const BLOCKED_DOC_EXTENSIONS = [".zip", ".gz"];
const MAX_FILES = 10;
const OPENAPI_PATTERNS = /\.(json|yaml|yml)$|openapi|swagger|\/v[23]\//i;

export function useDocFiles(systemId: string | undefined) {
  const { toast } = useToast();
  const { orgId } = useOrg();
  const queryClient = useQueryClient();

  const query = useDocFilesQuery(systemId);
  const uploadMutation = useUploadDocFiles(systemId);
  const addUrlMutation = useAddDocUrl(systemId);
  const deleteMutation = useDeleteDocFile(systemId);

  const docFiles = query.data ?? [];

  const [deleteTarget, setDeleteTarget] = useState<DocFile | null>(null);
  const [inlineMessage, setInlineMessage] = useState<string | null>(null);
  const inlineTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const showInlineMessage = useCallback((msg: string) => {
    if (inlineTimerRef.current) clearTimeout(inlineTimerRef.current);
    setInlineMessage(msg);
    inlineTimerRef.current = setTimeout(() => setInlineMessage(null), 4000);
  }, []);

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

    uploadMutation.mutate(validFiles, {
      onSuccess: ({ errors }) => {
        for (const err of errors) {
          toast({ title: "Upload failed", description: err, variant: "destructive" });
        }
      },
      onError: (error: any) => {
        toast({
          title: "Upload failed",
          description: error.message || "Failed to create upload URLs",
          variant: "destructive",
        });
      },
    });
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

    const source = looksLikeOpenApi(url) ? "openapi" : "scrape";
    addUrlMutation.mutate(
      { url, source },
      {
        onError: (error: any) => {
          showInlineMessage(error.message || "Failed to add URL");
        },
      },
    );
  };

  const handleConfirmDelete = () => {
    if (!deleteTarget || !systemId) return;
    const file = deleteTarget;
    setDeleteTarget(null);
    deleteMutation.mutate(file.id, {
      onError: (error: any) => {
        toast({ title: "Delete failed", description: error.message, variant: "destructive" });
      },
    });
  };

  const refreshDocFiles = useCallback(async () => {
    await queryClient.invalidateQueries({
      queryKey: queryKeys.docFiles.list(orgId, systemId ?? ""),
    });
  }, [queryClient, orgId, systemId]);

  return {
    docFiles,
    isLoadingDocs: query.isLoading,
    refreshDocFiles,
    hasFetched: query.isFetchedAfterMount,
    deleteTarget,
    setDeleteTarget,
    isDeleting: deleteMutation.isPending,
    isAddingUrl: addUrlMutation.isPending,
    inlineMessage,
    looksLikeOpenApi,
    handleFileUpload,
    handleAddUrl,
    handleConfirmDelete,
  };
}
