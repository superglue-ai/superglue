import { Button } from '@/src/components/ui/button';
import { Label } from '@/src/components/ui/label';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/src/components/ui/popover';
import { createPortal } from 'react-dom';
import { formatValueForDisplay, normalizeTemplateExpression, extractCredentials, DEFAULT_CODE_TEMPLATE } from '@/src/lib/template-utils';
import { isValidSourceDataArrowFunction } from '@/src/lib/general-utils';
import { maskCredentials } from '@superglue/shared';
import { Download, AlertCircle, Loader2 } from 'lucide-react';
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

const calcHeight = (content: string, maxHeight: number): number => {
  const lines = Math.max(1, (content || '').split('\n').length);
  return Math.min(maxHeight, Math.max(MIN_HEIGHT, lines * LINE_HEIGHT + EDITOR_PADDING));
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
  anchorRect?: { left: number; top: number } | null;
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
  const codeEditorRef = useRef<Monaco.editor.IStandaloneCodeEditor | null>(null);
  const popoverRef = useRef<HTMLDivElement>(null);
  
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
      const initialCode = templateContent 
        ? normalizeTemplateExpression(templateContent)
        : DEFAULT_CODE_TEMPLATE;
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
    const downloadContent = formatValueForDisplay(previewValue);
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
  const previewDisplay = Object.keys(credentials).length > 0 
    ? maskCredentials(previewDisplayRaw, credentials) 
    : previewDisplayRaw;
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

  useEffect(() => {
    if (!open || !anchorRect) return;
    const handleScroll = (e: Event) => {
      const target = e.target as HTMLElement;
      if (target?.closest?.('.monaco-editor') || popoverRef.current?.contains(target)) {
        return;
      }
      setOpen(false);
    };
    const handleClickOutside = (e: MouseEvent) => {
      if (popoverRef.current && !popoverRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    window.addEventListener('scroll', handleScroll, true);
    document.addEventListener('mousedown', handleClickOutside);
    return () => {
      window.removeEventListener('scroll', handleScroll, true);
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [open, anchorRect, setOpen]);

  const monacoOptions: Monaco.editor.IStandaloneEditorConstructionOptions = {
    minimap: { enabled: false },
    fontSize: 12,
    lineNumbers: 'on',
    lineNumbersMinChars: 3,
    glyphMargin: false,
    folding: false,
    scrollBeyondLastLine: false,
    wordWrap: 'off',
    contextmenu: false,
    renderLineHighlight: 'none',
    scrollbar: {
      vertical: 'auto',
      horizontal: 'auto',
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
  };

  const codeEditorHeight = calcHeight(codeContent, MAX_CODE_HEIGHT);
  const previewEditorHeight = calcHeight(previewDisplay, MAX_PREVIEW_HEIGHT);

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
        {codeContent && !isValidSourceDataArrowFunction(codeContent) && (
          <div className="text-[10px] text-amber-600 dark:text-amber-400 px-1 pt-1 flex items-center gap-1">
            <span>⚠</span>
            <span>Code will be auto-wrapped with (sourceData) =&gt; {'{'} ... {'}'} when executed</span>
          </div>
        )}
      </div>

      <div>
        <div className="flex items-center justify-between mb-2">
          <Label className="text-xs text-muted-foreground">Result Preview</Label>
          <div className="flex items-center gap-2">
            {isEvaluating && <Loader2 className="h-3 w-3 animate-spin text-muted-foreground" />}
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
        ) : (
          <div 
            className="rounded-md border bg-muted/30 overflow-hidden transition-[height] duration-150" 
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

  if (anchorRect && open) {
    const wouldOverflowRight = anchorRect.left + POPOVER_WIDTH > window.innerWidth - 16;
    const left = wouldOverflowRight ? anchorRect.left - POPOVER_WIDTH : anchorRect.left;
    
    return createPortal(
      <div
        ref={popoverRef}
        className="fixed z-50 rounded-md border bg-popover p-4 text-popover-foreground shadow-md animate-in fade-in-0 zoom-in-95"
        style={{
          left: Math.max(16, left),
          top: anchorRect.top,
          width: POPOVER_WIDTH,
          maxWidth: '90vw',
        }}
      >
        {popoverContent}
      </div>,
      document.body
    );
  }

  if (children) {
    return (
      <Popover open={open} onOpenChange={setOpen} modal={false}>
        <PopoverTrigger asChild>
          {children}
        </PopoverTrigger>
        <PopoverContent 
          className="p-4"
          align="start" 
          side="bottom"
          sideOffset={4}
          style={{ width: POPOVER_WIDTH, maxWidth: '90vw' }}
        >
          {popoverContent}
        </PopoverContent>
      </Popover>
    );
  }

  return null;
}
