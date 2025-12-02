import { Button } from '@/src/components/ui/button';
import { Label } from '@/src/components/ui/label';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
  PopoverAnchor,
} from '@/src/components/ui/popover';
import { formatValueForDisplay, normalizeTemplateExpression, extractCredentials, DEFAULT_CODE_TEMPLATE } from '@/src/lib/templating-utils';
import { isArrowFunction, maskCredentials } from '@superglue/shared';
import { Download, AlertCircle, Loader2, Eye, EyeOff } from 'lucide-react';
import { useEffect, useState, useRef, useCallback } from 'react';
import Editor from '@monaco-editor/react';
import { useMonacoTheme } from '@/src/hooks/useMonacoTheme';
import type * as Monaco from 'monaco-editor';
import { useTemplatePreview } from '../hooks/use-template-preview';

const POPOVER_WIDTH = 600;
const LINE_HEIGHT = 19;
const EDITOR_PADDING = 16;
const MIN_HEIGHT = 50;
const MAX_CODE_HEIGHT = 300;
const MAX_PREVIEW_HEIGHT = 250;
const CHARS_PER_LINE = 85;

const calcHeight = (content: string, maxHeight: number): number => {
  const lines = (content || '').split('\n');
  let totalLines = 0;
  for (const line of lines) {
    totalLines += Math.max(1, Math.ceil(line.length / CHARS_PER_LINE));
  }
  return Math.min(maxHeight, Math.max(MIN_HEIGHT, totalLines * LINE_HEIGHT + EDITOR_PADDING));
};

interface TemplateEditPopoverProps {
  template: string;
  sourceData: any;
  onSave: (newTemplate: string) => void;
  children?: React.ReactNode;
  canExecute?: boolean;
  externalOpen?: boolean;
  onExternalOpenChange?: (open: boolean) => void;
  onOpenChange?: (open: boolean) => void;
  anchorRect?: { left: number; top: number } | (() => { left: number; top: number } | null) | null;
}

export function TemplateEditPopover({
  template,
  sourceData,
  onSave,
  children,
  canExecute = true,
  externalOpen,
  onExternalOpenChange,
  onOpenChange,
  anchorRect,
}: TemplateEditPopoverProps) {
  const [internalOpen, setInternalOpen] = useState(false);
  const isControlled = externalOpen !== undefined;
  const open = isControlled ? externalOpen : internalOpen;
  
  const setOpen = useCallback((newOpen: boolean) => {
    if (isControlled) {
      onExternalOpenChange?.(newOpen);
    } else {
      setInternalOpen(newOpen);
    }
    onOpenChange?.(newOpen);
  }, [isControlled, onExternalOpenChange, onOpenChange]);

  const templateContent = template.replace(/^<<|>>$/g, '');
  const { theme, onMount } = useMonacoTheme();
  
  const [codeContent, setCodeContent] = useState(DEFAULT_CODE_TEMPLATE);
  const [showCredentials, setShowCredentials] = useState(false);
  const codeEditorRef = useRef<Monaco.editor.IStandaloneCodeEditor | null>(null);
  
  const hasSourceData = sourceData && typeof sourceData === 'object' && Object.keys(sourceData).length > 0;

  const { previewValue, previewError, isEvaluating } = useTemplatePreview(
    codeContent,
    sourceData,
    { enabled: open && canExecute && hasSourceData }
  );

  const handleEditorMount = useCallback((editor: Monaco.editor.IStandaloneCodeEditor) => {
    codeEditorRef.current = editor;
    onMount(editor);
    setTimeout(() => {
      editor.getAction('editor.action.formatDocument')?.run();
    }, 100);
  }, [onMount]);

  useEffect(() => {
    if (open) {
      let initialCode = DEFAULT_CODE_TEMPLATE;
      if (templateContent) {
        try {
          initialCode = normalizeTemplateExpression(templateContent);
        } catch {
          initialCode = templateContent;
        }
      }
      setCodeContent(initialCode);
      setTimeout(() => {
        codeEditorRef.current?.getAction('editor.action.formatDocument')?.run();
      }, 150);
    }
  }, [open, templateContent]);

  const handleSave = () => {
    const newTemplate = `<<${codeContent}>>`;
    onSave(newTemplate);
    setOpen(false);
  };

  const handleDownload = () => {
    const downloadContent = credentialsAreMasked ? maskedPreview : formatValueForDisplay(previewValue);
    const blob = new Blob([downloadContent], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `template-result.txt`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const credentials = extractCredentials(sourceData);
  const previewDisplayRaw = formatValueForDisplay(previewValue);
  const maskedPreview = Object.keys(credentials).length > 0 
    ? maskCredentials(previewDisplayRaw, credentials) 
    : previewDisplayRaw;
  const credentialsAreMasked = maskedPreview !== previewDisplayRaw;
  const previewDisplay = credentialsAreMasked && !showCredentials ? maskedPreview : previewDisplayRaw;
  const canDownload = previewDisplayRaw.length > 1000;

  useEffect(() => {
    if (!open) return;
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation();
        setOpen(false);
      }
    };
    document.addEventListener('keydown', handleEscape);
    return () => document.removeEventListener('keydown', handleEscape);
  }, [open, setOpen]);

  const monacoOptions: Monaco.editor.IStandaloneEditorConstructionOptions = {
    minimap: { enabled: false },
    fontSize: 12,
    lineNumbers: 'on',
    lineNumbersMinChars: 3,
    glyphMargin: false,
    folding: false,
    scrollBeyondLastLine: false,
    wordWrap: 'on',
    contextmenu: false,
    renderLineHighlight: 'none',
    scrollbar: {
      vertical: 'auto',
      horizontal: 'hidden',
      verticalScrollbarSize: 6,
      horizontalScrollbarSize: 6,
    },
    overviewRulerLanes: 0,
    hideCursorInOverviewRuler: true,
    overviewRulerBorder: false,
    padding: { top: 8, bottom: 8 },
    quickSuggestions: false,
    parameterHints: { enabled: false },
    codeLens: false,
    automaticLayout: true,
    stickyScroll: { enabled: false },
  };

  const codeEditorHeight = calcHeight(codeContent, MAX_CODE_HEIGHT);
  const previewEditorHeight = calcHeight(previewDisplay, MAX_PREVIEW_HEIGHT);

  const [, forceUpdate] = useState(0);
  const resolvedAnchorRect = typeof anchorRect === 'function' ? anchorRect() : anchorRect;

  useEffect(() => {
    if (!open || typeof anchorRect !== 'function') return;
    const handleScroll = () => forceUpdate(n => n + 1);
    window.addEventListener('scroll', handleScroll, true);
    return () => window.removeEventListener('scroll', handleScroll, true);
  }, [open, anchorRect]);

  const popoverContent = (
    <div className="space-y-4">
      <div>
        <Label className="text-xs mb-2 block text-muted-foreground">
          Template Expression
        </Label>
        <div 
          className="rounded-md border overflow-hidden transition-[height] duration-150" 
          style={{ height: codeEditorHeight }}
        >
          <Editor
            height={codeEditorHeight}
            defaultLanguage="javascript"
            value={codeContent}
            onChange={(val) => setCodeContent(val || '')}
            onMount={handleEditorMount}
            options={monacoOptions}
            theme={theme}
          />
        </div>
        {codeContent && !isArrowFunction(codeContent) && (
          <div className="text-[10px] text-amber-600 dark:text-amber-400 px-1 pt-1 flex items-center gap-1">
            <span>⚠</span>
            <span>Code will be auto-wrapped with (sourceData) =&gt; {'{'} ... {'}'} when executed</span>
          </div>
        )}
      </div>

      <div>
        <div className="flex items-center justify-between mb-2">
          <Label className="text-xs text-muted-foreground">Result Preview</Label>
          {canDownload && !previewError && canExecute && hasSourceData && (
            <Button
              variant="ghost"
              size="sm"
              onClick={handleDownload}
              className="h-6 text-xs px-2"
            >
              <Download className="h-3 w-3 mr-1" />
              Download
            </Button>
          )}
        </div>
        {!canExecute || !hasSourceData ? (
          <div className="flex items-center gap-2 p-3 bg-muted/50 border border-muted-foreground/20 rounded-md text-xs text-muted-foreground">
            <AlertCircle className="h-4 w-4 shrink-0" />
            <span>Preview available when step inputs are provided</span>
          </div>
        ) : previewError ? (
          <div className="p-3 bg-destructive/10 border border-destructive/20 rounded-md text-xs text-destructive max-h-24 overflow-auto">
            {previewError}
          </div>
        ) : isEvaluating ? (
          <div 
            className="flex items-center justify-center rounded-md border bg-muted/30"
            style={{ height: previewEditorHeight }}
          >
            <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
          </div>
        ) : (
          <div 
            className="relative rounded-md border bg-muted/30 overflow-hidden transition-[height] duration-150" 
            style={{ height: previewEditorHeight }}
          >
            <Editor
              height={previewEditorHeight}
              defaultLanguage="json"
              value={previewDisplay}
              onMount={onMount}
              options={{ ...monacoOptions, readOnly: true, fontSize: 11 }}
              theme={theme}
            />
            {credentialsAreMasked && (
              <button
                onClick={() => setShowCredentials(!showCredentials)}
                className="absolute top-1 right-2 p-1 rounded hover:bg-muted/80 text-muted-foreground hover:text-foreground transition-colors"
                title={showCredentials ? 'Hide credentials' : 'Show credentials'}
              >
                {showCredentials ? <EyeOff className="h-3 w-3" /> : <Eye className="h-3 w-3" />}
              </button>
            )}
          </div>
        )}
      </div>

      <div className="flex justify-end gap-2 pt-1">
        <Button variant="ghost" size="sm" onClick={() => setOpen(false)} className="h-8 text-xs">
          Cancel
        </Button>
        <Button size="sm" onClick={handleSave} disabled={!!previewError || !codeContent} className="h-8 text-xs">
          Save
        </Button>
      </div>
    </div>
  );

  const popoverProps = {
    className: "p-4",
    align: "start" as const,
    side: "bottom" as const,
    sideOffset: 4,
    style: { width: POPOVER_WIDTH, maxWidth: '90vw' },
    onOpenAutoFocus: (e: Event) => e.preventDefault(),
    onInteractOutside: (e: Event) => e.preventDefault(),
    onPointerDownOutside: (e: Event) => e.preventDefault(),
  };

  if (resolvedAnchorRect) {
    return (
      <Popover open={open} onOpenChange={setOpen} modal={false}>
        <PopoverAnchor asChild>
          <span
            style={{
              position: 'fixed',
              left: resolvedAnchorRect.left,
              top: resolvedAnchorRect.top,
              width: 0,
              height: 0,
              pointerEvents: 'none',
            }}
          />
        </PopoverAnchor>
        <PopoverContent {...popoverProps}>
          {popoverContent}
        </PopoverContent>
      </Popover>
    );
  }

  if (children) {
    return (
      <Popover open={open} onOpenChange={setOpen} modal={false}>
        <PopoverTrigger asChild>
          {children}
        </PopoverTrigger>
        <PopoverContent {...popoverProps}>
          {popoverContent}
        </PopoverContent>
      </Popover>
    );
  }

  return null;
}
