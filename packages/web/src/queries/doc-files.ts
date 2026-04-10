import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { queryKeys } from "./query-keys";
import { useSuperglueClient } from "./use-client";
import { useOrg } from "@/src/app/org-context";
import type { SuperglueClient } from "@superglue/shared";

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

const POLL_INTERVAL_MS = 3000;
const POLL_TIMEOUT_MS = 5 * 60 * 1000;

function hasProcessingFiles(files: DocFile[] | undefined): boolean {
  return !!files?.some((f) => f.status === "PROCESSING" || f.status === "PENDING");
}

export function useDocFilesQuery(systemId: string | undefined) {
  const { orgId } = useOrg();
  const createClient = useSuperglueClient();

  const query = useQuery<DocFile[]>({
    queryKey: queryKeys.docFiles.list(orgId, systemId ?? ""),
    queryFn: async () => {
      const client = createClient();
      const result = await client.listSystemFileReferences(systemId!);
      return result.files as DocFile[];
    },
    enabled: !!orgId && !!systemId,
    refetchInterval: (query) => {
      if (!hasProcessingFiles(query.state.data)) return false;
      const firstFetchTime = query.state.dataUpdatedAt;
      if (firstFetchTime && Date.now() - firstFetchTime > POLL_TIMEOUT_MS) return false;
      return POLL_INTERVAL_MS;
    },
  });

  return query;
}

export function useUploadDocFiles(systemId: string | undefined) {
  const { orgId } = useOrg();
  const createClient = useSuperglueClient();
  const queryClient = useQueryClient();
  const queryKey = queryKeys.docFiles.list(orgId, systemId ?? "");

  return useMutation({
    mutationFn: async (files: { file: File; uploadName: string }[]) => {
      const client = createClient();
      const fileInfos = await client.createSystemFileUploadUrls(
        systemId!,
        files.map((f) => ({
          fileName: f.uploadName,
          contentType: f.file.type || "application/octet-stream",
          contentLength: f.file.size,
        })),
      );

      const uploadResults = await Promise.allSettled(
        fileInfos.map((info, i) =>
          fetch(info.uploadUrl, {
            method: "PUT",
            body: files[i].file,
            headers: { "Content-Type": files[i].file.type || "application/octet-stream" },
          }).then((res) => {
            if (!res.ok) throw new Error(`Upload failed: ${res.status} ${res.statusText}`);
          }),
        ),
      );

      const errors: string[] = [];
      for (let i = 0; i < uploadResults.length; i++) {
        if (uploadResults[i].status === "rejected") {
          const reason = (uploadResults[i] as PromiseRejectedResult).reason;
          errors.push(`${files[i].uploadName}: ${reason?.message || "Unknown error"}`);
        }
      }

      return { fileInfos, errors };
    },
    onMutate: async (files) => {
      await queryClient.cancelQueries({ queryKey });
      const previous = queryClient.getQueryData<DocFile[]>(queryKey);
      queryClient.setQueryData<DocFile[]>(queryKey, (old = []) => [
        ...old,
        ...files.map((f) => ({
          id: `optimistic-${f.uploadName}-${Date.now()}`,
          source: "upload" as const,
          status: "PENDING",
          fileName: f.uploadName,
        })),
      ]);
      return { previous };
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey });
    },
    onError: (_err, _vars, context) => {
      if (context?.previous) {
        queryClient.setQueryData(queryKey, context.previous);
      }
    },
  });
}

export function useAddDocUrl(systemId: string | undefined) {
  const { orgId } = useOrg();
  const createClient = useSuperglueClient();
  const queryClient = useQueryClient();
  const queryKey = queryKeys.docFiles.list(orgId, systemId ?? "");

  return useMutation({
    mutationFn: async ({
      url,
      source,
    }: {
      url: string;
      source: "openapi" | "scrape";
    }): Promise<DocFile> => {
      const client = createClient();
      if (source === "openapi") {
        try {
          const result = await client.fetchOpenApiSpec(systemId!, url);
          return {
            id: result.fileReferenceId,
            source: "openapi",
            status: "COMPLETED",
            fileName: result.title || url,
            sourceUrl: url,
            createdAt: new Date().toISOString(),
          };
        } catch {
          return await fallbackToScrape(client, systemId!, url);
        }
      }
      return await fallbackToScrape(client, systemId!, url);
    },
    onMutate: async ({ url, source }) => {
      await queryClient.cancelQueries({ queryKey });
      const previous = queryClient.getQueryData<DocFile[]>(queryKey);
      const optimisticFile: DocFile = {
        id: `optimistic-url-${Date.now()}`,
        source,
        status: "PENDING",
        fileName: url,
        sourceUrl: url,
      };
      queryClient.setQueryData<DocFile[]>(queryKey, (old = []) => [...old, optimisticFile]);
      return { previous, optimisticId: optimisticFile.id };
    },
    onSuccess: (realFile, _vars, context) => {
      queryClient.setQueryData<DocFile[]>(queryKey, (old = []) =>
        old.map((f) => (f.id === context?.optimisticId ? realFile : f)),
      );
    },
    onError: (_err, _vars, context) => {
      if (context?.previous) {
        queryClient.setQueryData(queryKey, context.previous);
      }
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey });
    },
  });
}

async function fallbackToScrape(
  client: SuperglueClient,
  systemId: string,
  url: string,
): Promise<DocFile> {
  const result = await client.triggerSystemDocumentationScrapeJob(systemId, { url });
  return {
    id: result.fileReferenceId,
    source: "scrape",
    status: "PENDING",
    fileName: url,
    sourceUrl: url,
  };
}

export function useDeleteDocFile(systemId: string | undefined) {
  const { orgId } = useOrg();
  const createClient = useSuperglueClient();
  const queryClient = useQueryClient();
  const queryKey = queryKeys.docFiles.list(orgId, systemId ?? "");

  return useMutation({
    mutationFn: async (fileId: string) => {
      const client = createClient();
      await client.deleteSystemFileReference(systemId!, fileId);
    },
    onMutate: async (fileId) => {
      await queryClient.cancelQueries({ queryKey });
      const previous = queryClient.getQueryData<DocFile[]>(queryKey);
      queryClient.setQueryData<DocFile[]>(queryKey, (old = []) =>
        old.filter((f) => f.id !== fileId),
      );
      return { previous };
    },
    onError: (_err, _vars, context) => {
      if (context?.previous) {
        queryClient.setQueryData(queryKey, context.previous);
      }
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey });
    },
  });
}
