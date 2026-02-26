"use client";

import { formatBytes } from "@/src/lib/file-utils";
import { ArrowLeft, Check, Copy, Download } from "lucide-react";
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";

interface FileContentViewerFile {
  fileName: string;
  source?: string;
  sourceUrl?: string;
  createdAt?: string;
}

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

const LINE_HEIGHT = 20;
const OVERSCAN = 20;
const MAX_LINE_WIDTH = 200;
const MAX_PREVIEW_BYTES = 5 * 1024 * 1024;
const MAX_COPY_BYTES = 2 * 1024 * 1024;

interface DisplayRow {
  lineNum: number | null;
  text: string;
}

function buildDisplayRows(content: string): { rows: DisplayRow[]; totalSourceLines: number } {
  const sourceLines = content.split("\n");
  const rows: DisplayRow[] = [];
  for (let i = 0; i < sourceLines.length; i++) {
    const line = sourceLines[i];
    if (line.length <= MAX_LINE_WIDTH) {
      rows.push({ lineNum: i + 1, text: line });
    } else {
      let offset = 0;
      let first = true;
      while (offset < line.length) {
        rows.push({
          lineNum: first ? i + 1 : null,
          text: line.slice(offset, offset + MAX_LINE_WIDTH),
        });
        offset += MAX_LINE_WIDTH;
        first = false;
      }
    }
  }
  return { rows, totalSourceLines: sourceLines.length };
}

export function FileContentViewer({
  content,
  file,
  onClose,
}: {
  content: string;
  file: FileContentViewerFile;
  onClose: () => void;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const rafRef = useRef<number>(0);
  const [visibleRange, setVisibleRange] = useState({ start: 0, end: 60 });
  const [copied, setCopied] = useState(false);

  const sizeBytes = useMemo(() => new Blob([content]).size, [content]);
  const tooLargeToPreview = sizeBytes > MAX_PREVIEW_BYTES;
  const tooLargeToCopy = sizeBytes > MAX_COPY_BYTES;

  const { rows, totalSourceLines } = useMemo(
    () => (tooLargeToPreview ? { rows: [], totalSourceLines: 0 } : buildDisplayRows(content)),
    [content, tooLargeToPreview],
  );
  const totalRows = rows.length;
  const gutterWidth = Math.max(3, String(totalSourceLines).length) * 9 + 24;
  const totalHeight = totalRows * LINE_HEIGHT;

  const computeRange = useCallback(
    (scrollTop: number, height: number) => {
      const rawStart = Math.floor(scrollTop / LINE_HEIGHT) - OVERSCAN;
      const start = Math.max(0, rawStart);
      const count = Math.ceil(height / LINE_HEIGHT) + OVERSCAN * 2;
      const end = Math.min(totalRows, start + count);
      return { start, end };
    },
    [totalRows],
  );

  const handleScroll = useCallback(() => {
    cancelAnimationFrame(rafRef.current);
    rafRef.current = requestAnimationFrame(() => {
      const el = containerRef.current;
      if (!el) return;
      const next = computeRange(el.scrollTop, el.clientHeight);
      setVisibleRange((prev) => {
        if (prev.start === next.start && prev.end === next.end) return prev;
        return next;
      });
    });
  }, [computeRange]);

  useLayoutEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const obs = new ResizeObserver(() => {
      const next = computeRange(el.scrollTop, el.clientHeight);
      setVisibleRange(next);
    });
    obs.observe(el);
    setVisibleRange(computeRange(el.scrollTop, el.clientHeight));
    return () => obs.disconnect();
  }, [computeRange]);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [onClose]);

  useEffect(() => {
    return () => cancelAnimationFrame(rafRef.current);
  }, []);

  const handleDownload = useCallback(() => {
    const blob = new Blob([content], { type: "text/plain" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = file.fileName || "content.txt";
    a.click();
    URL.revokeObjectURL(url);
  }, [content, file.fileName]);

  const handleCopy = useCallback(async () => {
    await navigator.clipboard.writeText(content);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  }, [content]);

  const displayName = file.source === "scrape" && file.sourceUrl ? file.sourceUrl : file.fileName;
  const offsetY = visibleRange.start * LINE_HEIGHT;

  return (
    <div className="flex flex-col h-full animate-in fade-in duration-200">
      <div className="flex items-center gap-3 mb-3">
        <button
          onClick={onClose}
          className="h-7 w-7 flex items-center justify-center rounded-lg backdrop-blur-sm bg-white/[0.06] border border-white/[0.1] hover:bg-white/[0.12] text-muted-foreground hover:text-foreground transition-all"
        >
          <ArrowLeft className="h-3.5 w-3.5" />
        </button>
        <div className="flex-1 min-w-0">
          <span className="text-[13px] font-medium truncate block">{displayName}</span>
          <span className="text-[11px] text-muted-foreground/60">
            {!tooLargeToPreview && <>{totalSourceLines.toLocaleString()} lines · </>}
            {formatBytes(sizeBytes)}
            {file.createdAt && ` · ${formatRelativeDate(file.createdAt)}`}
          </span>
        </div>
        <div className="flex items-center gap-1.5">
          {!tooLargeToCopy && (
            <button
              onClick={handleCopy}
              className="h-7 px-2.5 flex items-center gap-1.5 rounded-lg backdrop-blur-sm bg-white/[0.06] border border-white/[0.1] hover:bg-white/[0.12] text-muted-foreground hover:text-foreground transition-all text-[11px] font-medium"
            >
              {copied ? <Check className="h-3 w-3 text-green-500" /> : <Copy className="h-3 w-3" />}
              {copied ? "Copied" : "Copy"}
            </button>
          )}
          <button
            onClick={handleDownload}
            className="h-7 px-2.5 flex items-center gap-1.5 rounded-lg backdrop-blur-sm bg-white/[0.06] border border-white/[0.1] hover:bg-white/[0.12] text-muted-foreground hover:text-foreground transition-all text-[11px] font-medium"
          >
            <Download className="h-3 w-3" />
            Download
          </button>
        </div>
      </div>

      {tooLargeToPreview ? (
        <div className="flex-1 min-h-0 rounded-lg border backdrop-blur-sm bg-white/[0.02] border-white/[0.08] flex items-center justify-center">
          <div className="text-center space-y-2">
            <p className="text-sm text-muted-foreground">
              File too large to preview ({formatBytes(sizeBytes)})
            </p>
            <p className="text-[11px] text-muted-foreground/50">
              Use the download button to view this file locally
            </p>
          </div>
        </div>
      ) : (
        <div className="flex-1 min-h-0 rounded-lg border backdrop-blur-sm bg-white/[0.02] border-white/[0.08] overflow-hidden">
          <div
            ref={containerRef}
            onScroll={handleScroll}
            className="h-full overflow-auto font-mono text-[12px] leading-[20px]"
          >
            <div style={{ height: totalHeight, position: "relative" }}>
              <div style={{ transform: `translateY(${offsetY}px)`, willChange: "transform" }}>
                {rows.slice(visibleRange.start, visibleRange.end).map((row, i) => {
                  const idx = visibleRange.start + i;
                  return (
                    <div
                      key={idx}
                      className="flex hover:bg-white/[0.03]"
                      style={{ height: LINE_HEIGHT }}
                    >
                      <span
                        className="shrink-0 text-right pr-3 pl-2 select-none border-r border-white/[0.06]"
                        style={{ width: gutterWidth, minWidth: gutterWidth }}
                      >
                        {row.lineNum !== null ? (
                          <span className="text-muted-foreground/30">{row.lineNum}</span>
                        ) : (
                          <span className="text-muted-foreground/15">↩</span>
                        )}
                      </span>
                      <span className="pl-3 pr-4 whitespace-pre text-muted-foreground/80">
                        {row.text || "\u00A0"}
                      </span>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
