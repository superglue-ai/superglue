"use client";

import { useState, useEffect, useMemo, useCallback, useRef } from "react";
import { useConfig } from "@/src/app/config-context";
import { EESuperglueClient } from "@/src/lib/ee-superglue-client";
import { tokenRegistry } from "@/src/lib/token-registry";
import { useDiscoveryCache } from "@/src/hooks/use-discovery-cache";
import { useDiscoveryPolling } from "@/src/hooks/use-discovery-polling";
import { DiscoveryRun, DiscoveryRunStatus, FileReference } from "@superglue/shared";
import { Button } from "@/src/components/ui/button";
import { FileChip } from "@/src/components/ui/FileChip";
import { DiscoveryLoadingAnimation } from "./DiscoveryLoadingAnimation";
import { FileUploadModal } from "./FileUploadModal";
import { DiscoveryResults } from "./DiscoveryResults";
import { Loader2, RotateCw, ArrowLeft, Plus, PanelRightClose, PanelRightOpen } from "lucide-react";
import { FileStatus } from "@superglue/shared";
import type { UploadedFileInfo } from "@/src/lib/file-utils";
import { useRouter, useSearchParams } from "next/navigation";
import { useToast } from "@/src/hooks/use-toast";

interface DiscoveryRunDetailProps {
  runId: string;
}

export function DiscoveryRunDetail({ runId }: DiscoveryRunDetailProps) {
  const [run, setRun] = useState<DiscoveryRun | null>(null);
  const [files, setFiles] = useState<FileReference[]>([]);
  const [loading, setLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [isUploadModalOpen, setIsUploadModalOpen] = useState(false);
  const [isSourcesCollapsed, setIsSourcesCollapsed] = useState(false);
  const config = useConfig();
  const router = useRouter();
  const searchParams = useSearchParams();
  const { toast } = useToast();
  const cache = useDiscoveryCache();
  const autoStartAttemptedRef = useRef(false);

  const fetchData = async (skipCache = false, silent = false) => {
    try {
      if (!silent) {
        setIsRefreshing(true);
      }

      // Try cache first (unless explicitly skipping, like on refresh)
      if (!skipCache) {
        const cached = cache.get(runId);
        if (cached) {
          setRun(cached.run);

          // Convert cached file info to FileReference format
          const fileRefs: FileReference[] = cached.files.map((f) => ({
            id: f.id,
            storageUri: "", // Will be populated from actual API if needed
            metadata: {
              originalFileName: f.originalFileName,
            },
            status: "PROCESSING" as any, // Files are still being processed
            createdAt: new Date(),
          }));

          setFiles(fileRefs);
          setLoading(false);
          setIsRefreshing(false);
          return;
        }
      }

      // Fall back to API
      const client = new EESuperglueClient({
        endpoint: config.superglueEndpoint,
        apiKey: tokenRegistry.getToken() || "",
        apiEndpoint: config.apiEndpoint,
      });

      // Fetch discovery run
      const runResponse = await client.getDiscoveryRun(runId);
      if (runResponse.success && runResponse.data) {
        setRun(runResponse.data);

        // Extract file IDs from sources
        const fileIds = runResponse.data.sources.filter((s) => s.type === "file").map((s) => s.id);

        // Only fetch file references if:
        // - This is initial load (no files yet), OR
        // - Some files are still in non-terminal states (need status updates)
        const shouldFetchFiles =
          files.length === 0 ||
          files.some(
            (f) =>
              f.status === FileStatus.PROCESSING ||
              f.status === FileStatus.PENDING ||
              f.status === FileStatus.UPLOADING,
          );

        if (fileIds.length > 0 && shouldFetchFiles) {
          const filesResponse = await client.listFileReferences(fileIds);
          if (filesResponse.success) {
            setFiles(filesResponse.items || []);
          }
        }
      }
    } catch (error) {
      console.error("Error fetching discovery run:", error);
    } finally {
      setLoading(false);
      if (!silent) {
        setIsRefreshing(false);
      }
    }
  };

  // Note: File uploads are now handled directly in InlineFileUpload component
  // before navigation to this page

  // Check if any files are still processing
  const hasProcessingFiles = useMemo(() => {
    return files.some(
      (file) =>
        file.status === FileStatus.PROCESSING ||
        file.status === FileStatus.PENDING ||
        file.status === FileStatus.UPLOADING,
    );
  }, [files]);

  // Determine loading phase: 'processing' (files), 'analyzing' (discovery), or null (not loading)
  const loadingPhase = useMemo(() => {
    if (!run) return null;
    if (run.status === DiscoveryRunStatus.PROCESSING) return "analyzing";
    if (run.status === DiscoveryRunStatus.PENDING && hasProcessingFiles) return "processing";
    return null;
  }, [run, hasProcessingFiles]);

  // Determine if polling should be enabled
  const shouldPoll = useMemo(() => {
    if (!run) return false;
    return run.status === DiscoveryRunStatus.PROCESSING || hasProcessingFiles;
  }, [run, hasProcessingFiles]);

  // Polling callback - fetches latest data without using cache (silent = no spinner on refresh button)
  const handlePoll = useCallback(async () => {
    await fetchData(true, true);
  }, []);

  // Set up polling
  useDiscoveryPolling({
    enabled: shouldPoll,
    onPoll: handlePoll,
  });

  const handleStartRun = async () => {
    try {
      // Optimistically update UI to show processing state immediately
      if (run) {
        setRun({ ...run, status: DiscoveryRunStatus.PROCESSING });
      }

      const client = new EESuperglueClient({
        endpoint: config.superglueEndpoint,
        apiKey: tokenRegistry.getToken() || "",
        apiEndpoint: config.apiEndpoint,
      });

      const response = await client.startDiscoveryRun(runId);

      if (response.success) {
        // Clear cache since run status has changed
        cache.clear(runId);

        // Refresh to get updated status
        await fetchData(true);
      } else {
        // Revert optimistic update on failure
        await fetchData(true);
      }
    } catch (error) {
      console.error("Error starting discovery run:", error);
      // Revert optimistic update on error
      await fetchData(true);
      toast({
        title: "Unable to start discovery",
        description:
          error instanceof Error
            ? error.message
            : "An error occurred while starting the discovery.",
        variant: "destructive",
      });
    }
  };

  const handleDeleteFile = async (fileKey: string) => {
    // The fileKey in our case is the file ID
    const fileId = fileKey;

    // Optimistically update UI immediately
    const previousFiles = [...files];
    const previousRun = run;
    setFiles((prev) => prev.filter((f) => f.id !== fileId));
    if (run) {
      setRun({ ...run, sources: run.sources.filter((s) => s.id !== fileId) });
    }

    try {
      const client = new EESuperglueClient({
        endpoint: config.superglueEndpoint,
        apiKey: tokenRegistry.getToken() || "",
        apiEndpoint: config.apiEndpoint,
      });

      // Update run to remove file source first
      if (previousRun) {
        const updatedSources = previousRun.sources.filter((s) => s.id !== fileId);
        await client.updateDiscoveryRun(runId, { sources: updatedSources });
      }

      // Then delete the file reference
      await client.deleteFileReference(fileId);

      // Clear cache since data has changed
      cache.clear(runId);
    } catch (error) {
      console.error("Error deleting file:", error);

      // Rollback optimistic update on error
      setFiles(previousFiles);
      setRun(previousRun);

      toast({
        title: "Unable to delete source",
        description:
          error instanceof Error ? error.message : "An error occurred while deleting the file.",
        variant: "destructive",
      });
    }
  };

  useEffect(() => {
    autoStartAttemptedRef.current = false;
    // Reset files when runId changes to prevent stale data from previous run
    // affecting shouldFetchFiles logic (which checks existing file statuses)
    setFiles([]);
    setLoading(true);
    fetchData();
  }, [runId]);

  // Auto-start discovery when run is PENDING and all files are COMPLETED
  useEffect(() => {
    if (
      run?.status === DiscoveryRunStatus.PENDING &&
      files.length > 0 &&
      files.every((f) => f.status === FileStatus.COMPLETED) &&
      !autoStartAttemptedRef.current
    ) {
      autoStartAttemptedRef.current = true;
      handleStartRun();
    }
  }, [run, files]);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="h-8 w-8 animate-spin text-foreground" />
      </div>
    );
  }

  if (!run) {
    return (
      <div className="text-center py-8">
        <p className="text-muted-foreground">Discovery not found</p>
        <Button variant="outline" onClick={() => router.push("/discovery")} className="mt-4">
          <ArrowLeft className="h-4 w-4 mr-2" />
          Back to Discoveries
        </Button>
      </div>
    );
  }

  const getTitle = () => {
    if (run.data?.title) {
      return run.data.title;
    }
    return "Discovery";
  };

  return (
    <div className="flex flex-col lg:flex-row gap-0 flex-1 min-h-0">
      {/* Main Content Area */}
      <div className="flex-1 flex flex-col min-w-0 order-2 lg:order-1 lg:pr-6 min-h-0">
        {/* Header */}
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 mb-6 flex-shrink-0">
          <div className="flex items-center gap-4">
            <Button variant="ghost" size="icon" onClick={() => router.push("/discovery")}>
              <ArrowLeft className="h-4 w-4" />
            </Button>
            <div>
              <h1 className="text-2xl font-bold">{getTitle()}</h1>
              <p className="text-sm text-muted-foreground">
                {run.sources?.filter((s) => s.type === "file").length || 0}{" "}
                {run.sources?.filter((s) => s.type === "file").length === 1 ? "source" : "sources"}
              </p>
            </div>
          </div>
          <div className="flex gap-2 w-full sm:w-auto">
            {run.status !== DiscoveryRunStatus.FAILED && (
              <Button variant="default" onClick={handleStartRun} disabled={!!loadingPhase}>
                <RotateCw className="h-4 w-4 mr-2" />
                Re-run Discovery
              </Button>
            )}
            <Button variant="outline" onClick={() => fetchData(true)} disabled={isRefreshing}>
              <RotateCw className={`h-4 w-4 mr-2 ${isRefreshing ? "animate-spin" : ""}`} />
              Refresh
            </Button>
          </div>
        </div>

        {/* Main Content based on status */}
        <div className="flex-1 min-h-0">
          {loadingPhase && (
            <>
              <DiscoveryLoadingAnimation phase={loadingPhase} />
              <p className="text-center text-xs text-muted-foreground/60 mt-4">
                This usually takes a couple of minutes. Feel free to leave and come back.
              </p>
            </>
          )}

          {!loadingPhase && run.status === DiscoveryRunStatus.COMPLETED && run.data && (
            <DiscoveryResults description={run.data.description} systems={run.data.systems} />
          )}

          {run.status === DiscoveryRunStatus.FAILED && run.data?.error && (
            <div className="border border-destructive rounded-lg p-6 bg-destructive/10">
              <h3 className="text-lg font-semibold text-destructive mb-2">Error</h3>
              <p className="text-sm text-muted-foreground">{run.data.error}</p>
            </div>
          )}
        </div>
      </div>

      {/* Right Sidebar - Sources (Collapsible) */}
      <div
        className={`lg:border-l flex-shrink-0 order-1 lg:order-2 flex flex-col min-h-0 transition-all duration-200 ${
          isSourcesCollapsed ? "w-10" : "w-full lg:w-[22rem] lg:pl-4"
        }`}
      >
        {isSourcesCollapsed ? (
          // Collapsed state - thin strip with expand button
          <div className="flex flex-col items-center py-2 h-full">
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8 mb-4"
              onClick={() => setIsSourcesCollapsed(false)}
              title="Show sources"
            >
              <PanelRightOpen className="h-4 w-4" />
            </Button>
            <span className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider [writing-mode:vertical-lr] rotate-180">
              SOURCES ({files.length})
            </span>
          </div>
        ) : (
          // Expanded state
          <>
            <div className="flex-1 space-y-4 min-h-0 overflow-y-auto">
              <div className="sticky top-0 bg-background z-10 pb-2">
                <div className="flex items-center gap-2 mb-4">
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-6 w-6 hidden lg:flex"
                    onClick={() => setIsSourcesCollapsed(true)}
                    title="Hide sources"
                  >
                    <PanelRightClose className="h-4 w-4" />
                  </Button>
                  <h2 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                    SOURCES
                  </h2>
                </div>

                {files.length === 0 ? (
                  <div className="text-center py-8 text-sm text-muted-foreground">
                    No sources yet
                  </div>
                ) : (
                  <div className="space-y-2">
                    {files.map((file) => {
                      const fileName = file.metadata?.originalFileName || file.id;
                      const isLoading =
                        file.status === FileStatus.PENDING ||
                        file.status === FileStatus.PROCESSING ||
                        file.status === FileStatus.UPLOADING;
                      const isFailed = file.status === FileStatus.FAILED;

                      // Convert FileReference to UploadedFileInfo format for FileChip
                      const fileInfo: UploadedFileInfo = {
                        key: file.id,
                        name: fileName, // Original filename
                        size: 0, // We don't have size info from FileReference
                        status: isFailed ? "error" : isLoading ? "processing" : "ready",
                        error: isFailed ? "Processing failed" : undefined,
                      };

                      return (
                        <FileChip
                          key={file.id}
                          file={fileInfo}
                          onRemove={handleDeleteFile}
                          showSize={false}
                          showOriginalName={true}
                          isLoading={isLoading}
                          className={
                            isFailed
                              ? "bg-red-50 dark:bg-red-950/20 border-red-200 dark:border-red-800"
                              : ""
                          }
                        />
                      );
                    })}
                  </div>
                )}
              </div>
            </div>

            <Button
              variant="outline"
              className="w-full mt-4"
              onClick={() => setIsUploadModalOpen(true)}
            >
              <Plus className="h-4 w-4 mr-2" />
              Add Sources
            </Button>
          </>
        )}
      </div>

      {/* Upload Modal for adding sources */}
      <FileUploadModal
        isOpen={isUploadModalOpen}
        onClose={() => setIsUploadModalOpen(false)}
        runId={runId}
        onUploadComplete={(newFiles) => {
          // Clear cache immediately since data has changed
          cache.clear(runId);

          if (newFiles && newFiles.length > 0) {
            // Add new files to the list with PROCESSING status immediately
            const newFileRefs: FileReference[] = newFiles.map((f) => ({
              id: f.id,
              storageUri: "",
              metadata: {
                originalFileName: f.originalFileName,
              },
              status: "PROCESSING" as any,
              createdAt: new Date(),
            }));

            setFiles((prev) => [...prev, ...newFileRefs]);
          }

          // Then refresh in the background to get full data from backend
          // Use skipCache=true to get fresh data
          fetchData(true);
        }}
      />
    </div>
  );
}
