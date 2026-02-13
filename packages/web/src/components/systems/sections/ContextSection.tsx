"use client";

import { useConfig } from "@/src/app/config-context";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/src/components/ui/alert-dialog";
import { FileContentViewer } from "@/src/components/ui/FileContentViewer";
import { HelpTooltip } from "@/src/components/utils/HelpTooltip";
import { cn } from "@/src/lib/general-utils";
import { tokenRegistry } from "@/src/lib/token-registry";
import { formatBytes } from "@/src/lib/file-utils";
import { ALLOWED_FILE_EXTENSIONS, SuperglueClient } from "@superglue/shared";
import {
  Globe,
  Loader2,
  Upload,
  BookOpen,
  X,
  Pencil,
  Check,
  ArrowLeft,
  ArrowRight,
  FileText,
  Link,
} from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { useSystemConfig } from "../context";
import { useDocFiles, type DocFile } from "../hooks/use-doc-files";
import { useFilePreview } from "../hooks/use-file-preview";

const BLOCKED_DOC_EXTENSIONS = [".zip", ".gz"];

function formatRelativeDate(iso?: string): string {
  if (!iso) return "";
  const date = new Date(iso);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMins = Math.floor(diffMs / 60000);
  if (diffMins < 1) return "just now";
  if (diffMins < 60) return `${diffMins}m ago`;
  const diffHours = Math.floor(diffMins / 60);
  if (diffHours < 24) return `${diffHours}h ago`;
  const diffDays = Math.floor(diffHours / 24);
  if (diffDays < 30) return `${diffDays}d ago`;
  return date.toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
}

function DocCard({
  file,
  onRequestDelete,
  onPreview,
}: {
  file: DocFile;
  onRequestDelete: (file: DocFile) => void;
  onPreview: (file: DocFile) => void;
}) {
  const isProcessing = file.status === "PROCESSING" || file.status === "PENDING";
  const isFailed = file.status === "FAILED";
  const isCompleted = file.status === "COMPLETED";

  const SourceIcon =
    file.source === "scrape" ? Globe : file.source === "openapi" ? BookOpen : FileText;

  const displayName =
    file.source === "scrape" && file.sourceUrl
      ? (() => {
          try {
            return new URL(file.sourceUrl).hostname.replace(/^www\./, "");
          } catch {
            return file.sourceUrl;
          }
        })()
      : file.fileName.length > 32
        ? (() => {
            const dotIdx = file.fileName.lastIndexOf(".");
            return dotIdx > 0
              ? file.fileName.slice(0, 28) + "…" + file.fileName.slice(dotIdx)
              : file.fileName.slice(0, 29) + "…";
          })()
        : file.fileName;

  const fullName = file.source === "scrape" && file.sourceUrl ? file.sourceUrl : file.fileName;

  const sourceLabel =
    file.source === "openapi" ? "OpenAPI" : file.source === "scrape" ? "Web" : "File";

  return (
    <div
      className={cn(
        "group relative flex flex-col items-center w-[120px] py-3 px-2 rounded-xl transition-all duration-200 cursor-default select-none",
        "hover:bg-muted/40",
      )}
      title={fullName}
    >
      {!isProcessing && (
        <button
          onClick={(e) => {
            e.stopPropagation();
            onRequestDelete(file);
          }}
          className="absolute top-1 right-1 h-5 w-5 flex items-center justify-center rounded-full bg-background/80 border border-border/50 shadow-sm text-muted-foreground hover:text-foreground hover:border-border transition-all opacity-0 group-hover:opacity-100 z-10"
          title="Delete"
        >
          <X className="h-2.5 w-2.5" />
        </button>
      )}

      <div
        className={cn(
          "relative w-[72px] h-[84px] rounded-lg flex flex-col items-center justify-center gap-1.5 transition-all duration-200",
          "bg-gradient-to-b from-muted/60 to-muted/30 border border-border/40",
          "shadow-[0_1px_2px_rgba(0,0,0,0.05)]",
          isCompleted && "group-hover:shadow-md group-hover:border-border/50 cursor-pointer",
          isProcessing && "opacity-35",
          isFailed && "opacity-35 border-destructive/20",
        )}
        onClick={() => isCompleted && onPreview(file)}
      >
        {isProcessing ? (
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground/50" />
        ) : isFailed ? (
          <X className="h-6 w-6 text-destructive/50" />
        ) : (
          <SourceIcon className="h-6 w-6 text-muted-foreground/40" />
        )}
        <span className="text-[8px] font-medium text-muted-foreground/40 uppercase tracking-wider">
          {sourceLabel}
        </span>
      </div>

      <div className="w-full mt-2 px-0.5 text-center">
        <span
          className={cn(
            "text-[11px] leading-tight block truncate font-medium",
            isProcessing ? "text-muted-foreground/35" : "text-foreground/70",
            isFailed && "text-destructive/50",
          )}
        >
          {displayName}
        </span>
        {isProcessing && (
          <span className="text-[9px] text-muted-foreground/30 block mt-0.5">Processing…</span>
        )}
        {isFailed && (
          <span className="text-[9px] text-destructive/40 block mt-0.5 truncate" title={file.error}>
            Failed
          </span>
        )}
        {isCompleted && file.createdAt && (
          <span className="text-[9px] text-muted-foreground/25 block mt-0.5">
            {formatRelativeDate(file.createdAt)}
          </span>
        )}
      </div>
    </div>
  );
}

function UsageInstructions({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const [isEditing, setIsEditing] = useState(false);
  const [editValue, setEditValue] = useState(value);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    setEditValue(value);
  }, [value]);

  useEffect(() => {
    if (isEditing && textareaRef.current) {
      textareaRef.current.focus();
      textareaRef.current.setSelectionRange(editValue.length, editValue.length);
    }
  }, [isEditing]);

  const handleSave = () => {
    onChange(editValue);
    setIsEditing(false);
  };

  const handleCancel = () => {
    setEditValue(value);
    setIsEditing(false);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Escape") handleCancel();
    if (e.key === "Enter" && e.metaKey) handleSave();
  };

  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2">
        <span className="text-sm font-medium">Usage Instructions</span>
        <HelpTooltip text="These instructions are emphasized when superglue builds or fixes tools for this system. Use them for rate limits, pagination rules, auth quirks, special endpoints, etc." />
        {!isEditing && (
          <div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
            <button
              onClick={() => setIsEditing(true)}
              className="h-5 w-5 flex items-center justify-center rounded transition-colors hover:bg-muted"
              title="Edit instructions"
            >
              <Pencil className="h-2.5 w-2.5 text-muted-foreground" />
            </button>
          </div>
        )}
      </div>
      {isEditing ? (
        <div className="relative rounded-lg border shadow-sm bg-muted/30">
          <textarea
            ref={textareaRef}
            value={editValue}
            onChange={(e) => setEditValue(e.target.value)}
            onKeyDown={handleKeyDown}
            maxLength={10000}
            className="w-full min-h-[72px] text-[13px] border-0 bg-transparent shadow-none resize-y focus:outline-none focus:ring-0 px-3 py-2 pr-20"
            placeholder="e.g., Always use pagination with max 50 items per page. Rate limit is 100 req/min..."
          />
          <div className="absolute top-1 right-1 flex items-center gap-1">
            <button
              type="button"
              onClick={handleSave}
              className="h-6 w-6 flex items-center justify-center rounded transition-colors hover:bg-green-500/20 text-green-600"
              title="Save (⌘+Enter)"
            >
              <Check className="h-3 w-3" />
            </button>
            <button
              type="button"
              onClick={handleCancel}
              className="h-6 w-6 flex items-center justify-center rounded transition-colors hover:bg-red-500/20 text-red-600"
              title="Cancel (Esc)"
            >
              <X className="h-3 w-3" />
            </button>
          </div>
          <div className="absolute bottom-1.5 right-2 text-[10px] text-muted-foreground bg-background/80 px-1.5 py-0.5 rounded">
            {editValue.length.toLocaleString()}/10,000
          </div>
        </div>
      ) : value ? (
        <p
          onClick={() => setIsEditing(true)}
          className="text-[13px] text-muted-foreground leading-relaxed cursor-pointer hover:text-foreground transition-colors line-clamp-3"
        >
          {value}
        </p>
      ) : (
        <div
          onClick={() => setIsEditing(true)}
          className="rounded-lg border border-dashed border-border/50 hover:border-border/70 bg-muted/10 px-3 py-4 cursor-pointer transition-colors"
        >
          <p className="text-[13px] italic text-muted-foreground/60 hover:text-muted-foreground transition-colors">
            No instructions set — click to add
          </p>
          <p className="text-[11px] text-muted-foreground/40 mt-1">
            e.g., rate limits, pagination rules, auth quirks, special endpoints...
          </p>
        </div>
      )}
    </div>
  );
}

export function ContextSection() {
  const { context, system, setSpecificInstructions, setDocFileCount } = useSystemConfig();
  const superglueConfig = useConfig();

  const client = useMemo(
    () =>
      new SuperglueClient({
        endpoint: superglueConfig.superglueEndpoint,
        apiKey: tokenRegistry.getToken(),
        apiEndpoint: superglueConfig.apiEndpoint,
      }),
    [superglueConfig.superglueEndpoint, superglueConfig.apiEndpoint],
  );

  const {
    docFiles,
    isLoadingDocs,
    hasFetched,
    deleteTarget,
    setDeleteTarget,
    isDeleting,
    isAddingUrl,
    inlineMessage,
    looksLikeOpenApi,
    handleFileUpload,
    handleAddUrl,
    handleConfirmDelete,
  } = useDocFiles(system.id, client);

  const { previewFile, previewContent, previewLoading, handlePreview, closePreview } =
    useFilePreview(client);

  const [addUrl, setAddUrl] = useState("");
  const [showUrlInput, setShowUrlInput] = useState(false);
  const urlInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (hasFetched) setDocFileCount(docFiles.length);
  }, [docFiles.length, setDocFileCount, hasFetched]);

  const onSubmitUrl = () => {
    const url = addUrl.trim();
    if (!url) return;
    setAddUrl("");
    setShowUrlInput(false);
    handleAddUrl(url);
  };

  if (previewFile) {
    return (
      <div className="flex flex-col h-[calc(100vh-280px)] min-h-[400px]">
        {previewLoading ? (
          <>
            <div className="flex items-center gap-3 mb-3">
              <button
                onClick={closePreview}
                className="h-7 w-7 flex items-center justify-center rounded-lg backdrop-blur-sm bg-white/[0.06] border border-white/[0.1] hover:bg-white/[0.12] text-muted-foreground hover:text-foreground transition-all"
              >
                <ArrowLeft className="h-3.5 w-3.5" />
              </button>
              <span className="text-[13px] font-medium truncate">
                {previewFile.source === "scrape" && previewFile.sourceUrl
                  ? previewFile.sourceUrl
                  : previewFile.fileName}
              </span>
            </div>
            <div className="flex-1 flex items-center justify-center">
              <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
            </div>
          </>
        ) : previewContent ? (
          <FileContentViewer content={previewContent} file={previewFile} onClose={closePreview} />
        ) : (
          <>
            <div className="flex items-center gap-3 mb-3">
              <button
                onClick={closePreview}
                className="h-7 w-7 flex items-center justify-center rounded-lg backdrop-blur-sm bg-white/[0.06] border border-white/[0.1] hover:bg-white/[0.12] text-muted-foreground hover:text-foreground transition-all"
              >
                <ArrowLeft className="h-3.5 w-3.5" />
              </button>
            </div>
            <p className="text-sm text-muted-foreground text-center py-12">No content available</p>
          </>
        )}
      </div>
    );
  }

  return (
    <div className="space-y-8">
      {/* Usage Instructions */}
      <div className="group">
        <UsageInstructions
          value={context.specificInstructions}
          onChange={setSpecificInstructions}
        />
      </div>

      {/* Knowledge Base */}
      <div className="space-y-3">
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <span className="text-sm font-medium">Knowledge Base</span>
            <HelpTooltip text="Documentation files that superglue uses to understand this system. Files can be uploaded, or fetched from URLs (OpenAPI specs are auto-detected)." />
          </div>
          {system.id && !isLoadingDocs && docFiles.length > 0 && (
            <span className="text-[11px] text-muted-foreground/70 tabular-nums">
              {(() => {
                const totalBytes = docFiles.reduce((sum, f) => sum + (f.contentLength ?? 0), 0);
                return totalBytes > 0
                  ? formatBytes(totalBytes)
                  : `${docFiles.length} file${docFiles.length !== 1 ? "s" : ""}`;
              })()}
            </span>
          )}
        </div>

        {system.id && !isLoadingDocs && (
          <div className="relative">
            {docFiles.length > 0 ? (
              <div className="flex flex-wrap gap-2 content-start min-h-[280px] p-3 rounded-xl border border-border/35 bg-muted/10 backdrop-blur-sm shadow-[0_1px_3px_rgba(0,0,0,0.04)]">
                {docFiles.map((file) => (
                  <DocCard
                    key={file.id}
                    file={file}
                    onRequestDelete={setDeleteTarget}
                    onPreview={handlePreview}
                  />
                ))}
              </div>
            ) : (
              <div className="flex flex-col items-center justify-center min-h-[280px] rounded-xl border border-dashed border-border/40 bg-muted/10 backdrop-blur-sm">
                <div className="flex gap-4 mb-3 opacity-15">
                  <FileText className="h-9 w-9" />
                  <Globe className="h-9 w-9" />
                  <BookOpen className="h-9 w-9" />
                </div>
                <p className="text-[13px] text-muted-foreground/40">No files yet</p>
                <p className="text-[11px] text-muted-foreground/25 mt-1">
                  Upload files or add URLs below
                </p>
              </div>
            )}

            {inlineMessage && (
              <div className="absolute bottom-12 left-0 right-0 flex justify-center px-2 z-10 animate-in fade-in slide-in-from-bottom-2 duration-200">
                <div className="rounded-lg border border-amber-500/40 bg-amber-500/15 px-3 py-2 text-[12px] font-medium text-amber-800 dark:text-amber-200 shadow-md max-w-full">
                  {inlineMessage}
                </div>
              </div>
            )}

            {/* Bottom toolbar */}
            <div className="flex items-center gap-2 mt-2">
              {showUrlInput ? (
                <div className="flex-1 flex items-center gap-2 rounded-xl border border-border/55 bg-muted/25 backdrop-blur-sm px-3 py-2.5 shadow-[0_1px_2px_rgba(0,0,0,0.04)] animate-in fade-in duration-150">
                  <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-muted/50 border border-border/30">
                    <Link className="h-3.5 w-3.5 text-muted-foreground/60" />
                  </div>
                  <input
                    ref={urlInputRef}
                    value={addUrl}
                    onChange={(e) => setAddUrl(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" && !isAddingUrl && addUrl.trim()) onSubmitUrl();
                      if (e.key === "Escape") {
                        setShowUrlInput(false);
                        setAddUrl("");
                      }
                    }}
                    autoFocus
                    type="url"
                    className="flex-1 min-w-0 bg-transparent text-[13px] outline-none placeholder:text-muted-foreground/40"
                    placeholder="Paste URL — OpenAPI auto-detected, other pages scraped"
                    disabled={isAddingUrl}
                  />
                  {isAddingUrl ? (
                    <Loader2 className="h-4 w-4 animate-spin text-muted-foreground/50 shrink-0" />
                  ) : (
                    <div className="flex items-center gap-1.5 shrink-0">
                      {addUrl.trim() && (
                        <span className="text-[10px] font-medium text-muted-foreground/50 px-1.5 py-0.5 rounded-md bg-muted/40 border border-border/20">
                          {looksLikeOpenApi(addUrl.trim()) ? "OpenAPI" : "Scrape"}
                        </span>
                      )}
                      <button
                        onClick={onSubmitUrl}
                        disabled={!addUrl.trim()}
                        className="h-7 w-7 flex items-center justify-center rounded-lg bg-primary/15 text-primary hover:bg-primary/25 border border-primary/20 transition-colors disabled:opacity-30 disabled:pointer-events-none"
                        title="Add (Enter)"
                      >
                        <ArrowRight className="h-3.5 w-3.5" />
                      </button>
                      <button
                        onClick={() => {
                          setShowUrlInput(false);
                          setAddUrl("");
                        }}
                        className="h-7 w-7 flex items-center justify-center rounded-lg border border-border/40 bg-muted/30 hover:bg-muted/50 text-muted-foreground hover:text-foreground transition-colors"
                        title="Cancel (Esc)"
                      >
                        <X className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  )}
                </div>
              ) : (
                <button
                  onClick={() => setShowUrlInput(true)}
                  className="flex items-center gap-2 px-3.5 py-2 rounded-xl border border-border/45 bg-muted/15 hover:bg-muted/25 hover:border-border/60 text-muted-foreground hover:text-foreground transition-all text-[12px] font-medium shadow-[0_1px_2px_rgba(0,0,0,0.03)]"
                >
                  <Link className="h-3.5 w-3.5" />
                  Add Documentation URL
                </button>
              )}
              {!showUrlInput && (
                <button
                  onClick={() => document.getElementById("doc-file-upload")?.click()}
                  className="flex items-center gap-2 px-3.5 py-2 rounded-xl border border-border/45 bg-muted/15 hover:bg-muted/25 hover:border-border/60 text-muted-foreground hover:text-foreground transition-all text-[12px] font-medium shadow-[0_1px_2px_rgba(0,0,0,0.03)]"
                >
                  <Upload className="h-3.5 w-3.5" />
                  Upload
                </button>
              )}
            </div>
          </div>
        )}

        {isLoadingDocs && docFiles.length === 0 && (
          <div className="flex items-center justify-center py-8">
            <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
          </div>
        )}
      </div>

      <input
        type="file"
        id="doc-file-upload"
        hidden
        multiple
        onChange={handleFileUpload}
        accept={ALLOWED_FILE_EXTENSIONS.filter((ext) => !BLOCKED_DOC_EXTENSIONS.includes(ext)).join(
          ",",
        )}
      />

      {/* Delete confirmation dialog */}
      <AlertDialog
        open={!!deleteTarget}
        onOpenChange={(open) => {
          if (!open) setDeleteTarget(null);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete file</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to remove{" "}
              <span className="font-medium text-foreground">
                {deleteTarget?.source === "scrape" && deleteTarget?.sourceUrl
                  ? deleteTarget.sourceUrl
                  : deleteTarget?.fileName}
              </span>{" "}
              from the knowledge base? This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isDeleting}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleConfirmDelete}
              disabled={isDeleting}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {isDeleting ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
