import { useQuery, type QueryClient } from "@tanstack/react-query";
import { DiscoveryRun, DiscoveryRunStatus, FileReference, FileStatus } from "@superglue/shared";
import { hasResolvedOrgId, useOrg } from "@/src/app/org-context";
import { queryKeys } from "./query-keys";
import { useEESuperglueClient } from "./use-client";

const DISCOVERY_POLL_INTERVAL_MS = 3000;

type UploadFileInfo = {
  id: string;
  originalFileName: string;
};

export function createOptimisticDiscoveryFiles(files: UploadFileInfo[]): FileReference[] {
  return files.map((file) => ({
    id: file.id,
    storageUri: "",
    metadata: {
      originalFileName: file.originalFileName,
    },
    status: FileStatus.PROCESSING,
    createdAt: new Date(),
  }));
}

export function getDiscoveryFileIds(run: DiscoveryRun | null | undefined): string[] {
  if (!run?.sources?.length) {
    return [];
  }

  return run.sources.filter((source) => source.type === "file").map((source) => source.id);
}

export function hasProcessingDiscoveryFiles(files: FileReference[]): boolean {
  return files.some(
    (file) =>
      file.status === FileStatus.PROCESSING ||
      file.status === FileStatus.PENDING ||
      file.status === FileStatus.UPLOADING,
  );
}

export function shouldPollDiscoveryRun(run: DiscoveryRun | null | undefined): boolean {
  return run?.status === DiscoveryRunStatus.PROCESSING;
}

export function seedDiscoveryQueryData(
  queryClient: QueryClient,
  orgId: string,
  run: DiscoveryRun,
  files: UploadFileInfo[],
) {
  queryClient.setQueryData(queryKeys.discovery.detail(orgId, run.id), run);
  const fileIdsKey = files.map((file) => file.id).join(",");
  queryClient.setQueryData(
    queryKeys.discovery.filesByIds(orgId, run.id, fileIdsKey),
    createOptimisticDiscoveryFiles(files),
  );
  queryClient.setQueryData<DiscoveryRun[]>(queryKeys.discovery.list(orgId), (old = []) => {
    const withoutRun = old.filter((item) => item.id !== run.id);
    return [run, ...withoutRun];
  });
}

export function useDiscoveryRunsQuery() {
  const { orgId } = useOrg();
  const createClient = useEESuperglueClient();

  return useQuery({
    queryKey: queryKeys.discovery.list(orgId),
    queryFn: async () => {
      const response = await createClient().listDiscoveryRuns(100, 0);
      return response.success ? response.items || [] : [];
    },
    enabled: hasResolvedOrgId(orgId),
  });
}

export function useDiscoveryRunQuery(runId: string | undefined) {
  const { orgId } = useOrg();
  const createClient = useEESuperglueClient();

  return useQuery({
    queryKey: queryKeys.discovery.detail(orgId, runId ?? ""),
    queryFn: async () => {
      const response = await createClient().getDiscoveryRun(runId!);
      return response.success ? response.data : null;
    },
    enabled: hasResolvedOrgId(orgId) && !!runId,
    refetchInterval: (query) =>
      shouldPollDiscoveryRun(query.state.data ?? null) ? DISCOVERY_POLL_INTERVAL_MS : false,
  });
}

export function useDiscoveryFilesQuery(runId: string | undefined, fileIds: string[]) {
  const { orgId } = useOrg();
  const createClient = useEESuperglueClient();
  const fileIdsKey = fileIds.join(",");

  return useQuery({
    queryKey: queryKeys.discovery.filesByIds(orgId, runId ?? "", fileIdsKey),
    queryFn: async () => {
      if (fileIds.length === 0) {
        return [];
      }

      const response = await createClient().listFileReferences(fileIds);
      return response.success ? response.items || [] : [];
    },
    enabled: hasResolvedOrgId(orgId) && !!runId && fileIds.length > 0,
    refetchInterval: (query) =>
      hasProcessingDiscoveryFiles(query.state.data ?? []) ? DISCOVERY_POLL_INTERVAL_MS : false,
  });
}
