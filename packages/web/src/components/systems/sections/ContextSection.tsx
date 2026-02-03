"use client";

import { useConfig } from "@/src/app/config-context";
import { Button } from "@/src/components/ui/button";
import { Label } from "@/src/components/ui/label";
import { Textarea } from "@/src/components/ui/textarea";
import { Input } from "@/src/components/ui/input";
import { FileChip } from "@/src/components/ui/FileChip";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/src/components/ui/dialog";
import { HelpTooltip } from "@/src/components/utils/HelpTooltip";
import { useToast } from "@/src/hooks/use-toast";
import { cn } from "@/src/lib/general-utils";
import { tokenRegistry } from "@/src/lib/token-registry";
import {
  formatBytes,
  MAX_TOTAL_FILE_SIZE_DOCUMENTATION,
  processAndExtractFile,
  sanitizeFileName,
  type UploadedFileInfo,
} from "@/src/lib/file-utils";
import { ALLOWED_FILE_EXTENSIONS, SuperglueClient } from "@superglue/shared";
import { FileText, Globe, Loader2, Pencil, Upload, Code, Eye } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useSystemConfig } from "../context";
import { Streamdown } from "streamdown";

function MarkdownPreview({ content }: { content: string }) {
  const [ready, setReady] = useState(false);

  useEffect(() => {
    setReady(false);
    const frame = requestAnimationFrame(() => {
      setReady(true);
    });
    return () => cancelAnimationFrame(frame);
  }, [content]);

  if (!ready) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return <Streamdown>{content}</Streamdown>;
}

type DocSourceMode = "url" | "file";

export function ContextSection() {
  const {
    context,
    setDocumentationUrl,
    setDocumentation,
    setSpecificInstructions,
    setHasUploadedFile,
  } = useSystemConfig();

  const superglueConfig = useConfig();
  const { toast } = useToast();

  const [isDocViewerOpen, setIsDocViewerOpen] = useState(false);
  const [editedDoc, setEditedDoc] = useState("");
  const [editorViewMode, setEditorViewMode] = useState<"edit" | "preview">("edit");
  const [isUploading, setIsUploading] = useState(false);
  const [uploadedFile, setUploadedFile] = useState<UploadedFileInfo | null>(null);
  const [inputMode, setInputMode] = useState<DocSourceMode>(
    context.hasUploadedFile ? "file" : "url",
  );

  const client = useMemo(
    () =>
      new SuperglueClient({
        endpoint: superglueConfig.superglueEndpoint,
        apiKey: tokenRegistry.getToken(),
        apiEndpoint: superglueConfig.apiEndpoint,
      }),
    [superglueConfig.superglueEndpoint, superglueConfig.apiEndpoint],
  );

  const parseFileFromUrl = (fileUrl: string): UploadedFileInfo | null => {
    if (!fileUrl.startsWith("file://")) return null;
    const filename = fileUrl.replace("file://", "").split(",")[0]?.trim();
    if (!filename) return null;
    return {
      name: filename,
      size: null,
      key: filename,
      status: "ready" as const,
    };
  };

  const displayFile =
    uploadedFile || (context.hasUploadedFile ? parseFileFromUrl(context.documentationUrl) : null);

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (file.size > MAX_TOTAL_FILE_SIZE_DOCUMENTATION) {
      toast({
        title: "File too large",
        description: `Documentation files cannot exceed ${formatBytes(MAX_TOTAL_FILE_SIZE_DOCUMENTATION)}`,
        variant: "destructive",
      });
      e.target.value = "";
      return;
    }

    const fileInfo: UploadedFileInfo = {
      name: file.name,
      size: file.size,
      key: sanitizeFileName(file.name, { removeExtension: false, lowercase: false }),
      status: "processing",
    };
    setUploadedFile(fileInfo);
    setIsUploading(true);

    try {
      const data = await processAndExtractFile(file, client);
      const text = typeof data === "string" ? data : JSON.stringify(data, null, 2);
      setUploadedFile({ ...fileInfo, status: "ready" });
      setDocumentation(text);
      setDocumentationUrl(`file://${fileInfo.key}`);
      setHasUploadedFile(true);
    } catch (error: any) {
      console.error("Error reading file:", error);
      setUploadedFile({ ...fileInfo, status: "error", error: error.message });
      toast({
        title: "Failed to process file",
        description: error.message,
        variant: "destructive",
      });
    } finally {
      setIsUploading(false);
    }
  };

  const handleRemoveFile = () => {
    setUploadedFile(null);
    setDocumentation("");
    setDocumentationUrl("");
    setHasUploadedFile(false);
    const fileInput = document.getElementById("doc-file-upload") as HTMLInputElement;
    if (fileInput) fileInput.value = "";
  };

  const handleOpenEditor = useCallback(() => {
    setEditedDoc(context.documentation);
    setEditorViewMode("edit");
    setIsDocViewerOpen(true);
  }, [context.documentation]);

  const handleSaveEdit = useCallback(() => {
    setDocumentation(editedDoc);
    setIsDocViewerOpen(false);
  }, [editedDoc, setDocumentation]);

  const docSourceLabel = context.hasUploadedFile
    ? displayFile?.name || "Uploaded file"
    : context.documentationUrl
      ? context.documentationUrl
      : null;

  return (
    <div className="space-y-6">
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Label className="text-sm font-medium">Documentation Source</Label>
            <HelpTooltip text="Provide a URL to scrape or upload a file. Documentation will be fetched when you save the system." />
          </div>
          <div className="flex items-center rounded-lg border border-border/50 bg-muted/20 p-0.5">
            <button
              type="button"
              onClick={() => setInputMode("url")}
              className={cn(
                "flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium transition-all border",
                inputMode === "url"
                  ? "bg-background text-foreground shadow-sm border-border/50"
                  : "text-muted-foreground hover:text-foreground border-transparent",
              )}
            >
              <Globe className="h-3.5 w-3.5" />
              URL
            </button>
            <button
              type="button"
              onClick={() => setInputMode("file")}
              className={cn(
                "flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium transition-all border",
                inputMode === "file"
                  ? "bg-background text-foreground shadow-sm border-border/50"
                  : "text-muted-foreground hover:text-foreground border-transparent",
              )}
            >
              <FileText className="h-3.5 w-3.5" />
              File
            </button>
          </div>
        </div>

        {inputMode === "url" && (
          <div className="space-y-1.5">
            <Input
              value={context.documentationUrl.startsWith("file://") ? "" : context.documentationUrl}
              onChange={(e) => {
                setDocumentationUrl(e.target.value);
                if (context.hasUploadedFile) {
                  setHasUploadedFile(false);
                }
              }}
              placeholder="https://docs.example.com/api"
              className="h-10 bg-background/50 border-border/60 focus:border-primary/50 transition-colors"
            />
            {context.hasUploadedFile && (
              <p className="text-xs text-muted-foreground/80">
                Currently using uploaded file. Enter a URL to switch to URL-based documentation.
              </p>
            )}
          </div>
        )}

        {inputMode === "file" && (
          <div className="flex items-center gap-2">
            {displayFile ? (
              <FileChip
                file={displayFile}
                onRemove={handleRemoveFile}
                size="large"
                rounded="sm"
                showOriginalName={true}
                showSize={displayFile.size > 0}
              />
            ) : (
              <div className="space-y-1.5">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => document.getElementById("doc-file-upload")?.click()}
                  disabled={isUploading}
                  className="h-10 px-4 bg-background/50 border-border/60 hover:bg-muted/50"
                >
                  {isUploading ? (
                    <>
                      <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                      Processing...
                    </>
                  ) : (
                    <>
                      <Upload className="h-4 w-4 mr-2" />
                      Upload File
                    </>
                  )}
                </Button>
                {context.documentationUrl && !context.hasUploadedFile && (
                  <p className="text-xs text-muted-foreground/80">
                    Currently using URL. Upload a file to switch to file-based documentation.
                  </p>
                )}
              </div>
            )}
          </div>
        )}

        <input
          type="file"
          id="doc-file-upload"
          hidden
          onChange={handleFileUpload}
          accept={ALLOWED_FILE_EXTENSIONS.join(",")}
        />
      </div>

      <div className="space-y-3">
        <div className="flex items-center gap-2">
          <Label className="text-sm font-medium">Extracted Content</Label>
          {context.documentation && (
            <span className="text-xs text-muted-foreground px-2 py-0.5 rounded-full bg-muted/50">
              {context.documentation.length.toLocaleString()} chars
            </span>
          )}
        </div>

        {docSourceLabel && !context.isDocumentationPending && (
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            {context.hasUploadedFile ? (
              <FileText className="h-3.5 w-3.5" />
            ) : (
              <Globe className="h-3.5 w-3.5" />
            )}
            <span className="truncate max-w-[300px]">{docSourceLabel}</span>
          </div>
        )}

        <div
          className={cn(
            "relative rounded-xl border border-border/50 bg-gradient-to-b from-muted/30 to-muted/10 overflow-hidden transition-all",
            context.documentation &&
              !context.isDocumentationPending &&
              "cursor-pointer hover:border-border/70 hover:shadow-sm",
          )}
          onClick={
            context.documentation && !context.isDocumentationPending ? handleOpenEditor : undefined
          }
        >
          {!context.isDocumentationPending && context.documentation && (
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                handleOpenEditor();
              }}
              className="absolute top-2 right-2 h-7 w-7 flex items-center justify-center rounded-md bg-background/80 hover:bg-background transition-colors border border-border/50 z-10"
              title="Edit"
            >
              <Pencil className="h-3.5 w-3.5 text-muted-foreground" />
            </button>
          )}
          {context.isDocumentationPending ? (
            <div className="h-24 flex items-center justify-center gap-3">
              <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
              <span className="text-sm text-muted-foreground">Scraping documentation...</span>
            </div>
          ) : context.documentation ? (
            <div className="max-h-[120px] overflow-hidden p-4">
              <div className="prose prose-sm max-w-none dark:prose-invert prose-p:my-1 prose-headings:my-1 prose-headings:text-sm prose-pre:bg-muted prose-pre:text-xs prose-code:text-xs text-xs leading-relaxed [&_a]:pointer-events-none [&_a]:no-underline [&_a]:text-inherit">
                <Streamdown>
                  {context.documentation.length > 500
                    ? context.documentation.substring(0, 500) + "..."
                    : context.documentation}
                </Streamdown>
              </div>
            </div>
          ) : (
            <div className="h-24 flex items-center justify-center">
              <span className="text-sm text-muted-foreground">
                {inputMode === "url"
                  ? "Enter a URL and save to fetch documentation"
                  : "Upload a file to extract documentation"}
              </span>
            </div>
          )}
        </div>
      </div>

      <div className="space-y-3">
        <div className="flex items-center gap-2">
          <Label htmlFor="specificInstructions" className="text-sm font-medium">
            Specific Instructions
          </Label>
          <HelpTooltip text="Additional guidance for the AI (rate limits, special endpoints, etc.)" />
        </div>
        <div className="relative">
          <Textarea
            id="specificInstructions"
            value={context.specificInstructions}
            onChange={(e) => setSpecificInstructions(e.target.value)}
            placeholder="e.g., Always use pagination with max 50 items per page. Rate limit is 100 requests per minute. Use the /v2 endpoints for better performance..."
            className={cn(
              "min-h-[240px] pr-16 text-sm resize-y bg-background/50 border-border/60 focus:border-primary/50 transition-colors leading-relaxed",
              context.specificInstructions.length > 10000 && "border-destructive",
            )}
            maxLength={10000}
          />
          <div className="absolute bottom-3 right-3 text-xs text-muted-foreground/70 bg-background/80 px-2 py-1 rounded">
            {context.specificInstructions.length.toLocaleString()}/10,000
          </div>
        </div>
      </div>

      <Dialog open={isDocViewerOpen} onOpenChange={setIsDocViewerOpen}>
        <DialogContent className="max-w-4xl max-h-[85vh] flex flex-col">
          <DialogHeader>
            <div className="flex items-center justify-between">
              <DialogTitle className="flex items-center gap-2">
                <FileText className="h-5 w-5" />
                Edit Documentation
              </DialogTitle>
              <div className="flex items-center rounded-lg border border-border/50 bg-muted/20 p-0.5 mr-6">
                <button
                  type="button"
                  onClick={() => setEditorViewMode("edit")}
                  className={cn(
                    "flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium transition-all border",
                    editorViewMode === "edit"
                      ? "bg-background text-foreground shadow-sm border-border/50"
                      : "text-muted-foreground hover:text-foreground border-transparent",
                  )}
                >
                  <Code className="h-3.5 w-3.5" />
                  Edit
                </button>
                <button
                  type="button"
                  onClick={() => setEditorViewMode("preview")}
                  className={cn(
                    "flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium transition-all border",
                    editorViewMode === "preview"
                      ? "bg-background text-foreground shadow-sm border-border/50"
                      : "text-muted-foreground hover:text-foreground border-transparent",
                  )}
                >
                  <Eye className="h-3.5 w-3.5" />
                  Preview
                </button>
              </div>
            </div>
          </DialogHeader>
          <div className="flex-1 min-h-0 overflow-y-auto">
            {editorViewMode === "edit" ? (
              <Textarea
                value={editedDoc}
                onChange={(e) => setEditedDoc(e.target.value)}
                className="h-full min-h-[400px] font-mono text-sm resize-none focus-visible:ring-0 focus-visible:ring-offset-0 bg-background/50 border-border/60"
                placeholder="Enter documentation content..."
              />
            ) : (
              <div className="prose prose-sm max-w-none dark:prose-invert prose-p:my-2 prose-headings:my-3 prose-headings:font-semibold prose-pre:bg-muted prose-code:text-xs p-4 bg-gradient-to-b from-muted/30 to-muted/10 rounded-xl min-h-[400px] [&_a]:pointer-events-none [&_a]:no-underline [&_a]:text-inherit">
                <MarkdownPreview content={editedDoc} />
              </div>
            )}
          </div>
          <DialogFooter className="gap-2 sm:gap-0">
            <Button variant="outline" onClick={() => setIsDocViewerOpen(false)}>
              Cancel
            </Button>
            <Button onClick={handleSaveEdit}>Save Changes</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
