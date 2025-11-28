import { Button } from '@/src/components/ui/button';
import { Label } from '@/src/components/ui/label';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/src/components/ui/popover';
import { createPortal } from 'react-dom';
import { evaluateTemplate, formatValueForDisplay, normalizeTemplateExpression } from '@/src/lib/template-utils';
import { maskCredentials } from '@superglue/shared';
import { Download, AlertCircle } from 'lucide-react';
import { useEffect, useState, useRef, useCallback } from 'react';
import Editor from '@monaco-editor/react';
import { useMonacoTheme } from '@/src/hooks/useMonacoTheme';
import type * as Monaco from 'monaco-editor';

const DEFAULT_CODE_TEMPLATE = '(sourceData) => ({})';

interface TemplateEditPopoverProps {
  template: string;
  stepData: any;
  loopData?: any;
  onSave: (newTemplate: string) => void;
  children?: React.ReactNode;
  readOnly?: boolean;
  canExecute?: boolean;
  externalOpen?: boolean;
  onExternalOpenChange?: (open: boolean) => void;
  onOpenChange?: (open: boolean) => void;
  anchorRect?: { left: number; top: number } | null;
}

export function TemplateEditPopover({
  template,
  stepData,
  loopData,
  onSave,
  children,
  readOnly = false,
  canExecute = true,
  externalOpen,
  onExternalOpenChange,
  onOpenChange,
  anchorRect,
}: TemplateEditPopoverProps) {
  const [internalOpen, setInternalOpen] = useState(false);
  const isControlled = externalOpen !== undefined;
  const open = isControlled ? externalOpen : internalOpen;
  
  const setOpen = (newOpen: boolean) => {
    if (isControlled) {
      onExternalOpenChange?.(newOpen);
    } else {
      setInternalOpen(newOpen);
    }
    onOpenChange?.(newOpen);
  };

  const templateContent = template.replace(/^<<|>>$/g, '');
  const { theme, onMount } = useMonacoTheme();
  
  const LINE_HEIGHT = 19;
  const EDITOR_PADDING = 16;
  const MIN_EDITOR_HEIGHT = LINE_HEIGHT + EDITOR_PADDING;
  const MAX_CODE_EDITOR_HEIGHT = 300;
  const MAX_PREVIEW_HEIGHT = 250;

  const [codeContent, setCodeContent] = useState(DEFAULT_CODE_TEMPLATE);
  const [previewValue, setPreviewValue] = useState<any>({});
  const [previewError, setPreviewError] = useState<string | null>(null);
  const [isEvaluating, setIsEvaluating] = useState(false);
  const lastEvaluatedCodeRef = useRef<string>('');
  const [previewHeight, setPreviewHeight] = useState(MIN_EDITOR_HEIGHT);
  const [editorWidth, setEditorWidth] = useState(600);
  const [editorHeight, setEditorHeight] = useState(MIN_EDITOR_HEIGHT);
  
  const codeEditorRef = useRef<Monaco.editor.IStandaloneCodeEditor | null>(null);
  const previewEditorRef = useRef<Monaco.editor.IStandaloneCodeEditor | null>(null);
  
  const hasStepData = stepData && typeof stepData === 'object' && Object.keys(stepData).length > 0;

  const calculateEditorDimensions = useCallback((editorContent: string) => {
    if (!editorContent) {
      return { width: 600, height: MIN_EDITOR_HEIGHT };
    }
    
    const lines = editorContent.split('\n');
    const lineCount = Math.max(1, lines.length);
    const longestLine = Math.max(...lines.map(line => line.length), 0);
    const charWidth = 8.4;
    const minWidth = 300;
    const maxWidth = 900;
    const lineNumberWidth = lineCount > 0 ? Math.max(3, String(lineCount).length) * 8 + 20 : 0;
    
    const calculatedWidth = Math.max(minWidth, Math.min(longestLine * charWidth + 100 + lineNumberWidth, maxWidth));
    const contentHeight = lineCount * LINE_HEIGHT + EDITOR_PADDING;
    const calculatedHeight = Math.max(MIN_EDITOR_HEIGHT, Math.min(contentHeight, MAX_CODE_EDITOR_HEIGHT));
    
    return { width: calculatedWidth, height: calculatedHeight };
  }, [MIN_EDITOR_HEIGHT, LINE_HEIGHT, EDITOR_PADDING, MAX_CODE_EDITOR_HEIGHT]);

  const handleCodeEditorMount = useCallback((editor: Monaco.editor.IStandaloneCodeEditor) => {
    codeEditorRef.current = editor;
    onMount(editor);
    
    const updateDimensions = () => {
      if (!editor) return;
      const editorContent = editor.getValue();
      const dimensions = calculateEditorDimensions(editorContent);
      setEditorWidth(dimensions.width);
      setEditorHeight(dimensions.height);
      
      setTimeout(() => {
        editor.layout();
      }, 0);
    };
    
    updateDimensions();
    editor.onDidChangeModelContent(() => {
      updateDimensions();
    });

    setTimeout(() => {
      editor.getAction('editor.action.formatDocument')?.run();
    }, 100);
  }, [onMount, calculateEditorDimensions]);

  useEffect(() => {
    if (open) {
      let initialCode: string;
      if (!templateContent) {
        initialCode = DEFAULT_CODE_TEMPLATE;
        setPreviewValue({});
        setPreviewError(null);
      } else {
        initialCode = normalizeTemplateExpression(templateContent);
      }
      
      lastEvaluatedCodeRef.current = '';
      setCodeContent(initialCode);
      const dimensions = calculateEditorDimensions(initialCode);
      setEditorWidth(dimensions.width);
      setEditorHeight(dimensions.height);

      setTimeout(() => {
        codeEditorRef.current?.getAction('editor.action.formatDocument')?.run();
      }, 150);
    }
  }, [open, templateContent, calculateEditorDimensions]);

  useEffect(() => {
    const dimensions = calculateEditorDimensions(codeContent);
    setEditorWidth(dimensions.width);
    setEditorHeight(dimensions.height);
    
    if (codeEditorRef.current) {
      setTimeout(() => {
        codeEditorRef.current?.layout();
      }, 0);
    }
  }, [codeContent, calculateEditorDimensions]);

  useEffect(() => {
    if (!open || !canExecute || !hasStepData) {
      setPreviewError(null);
      setIsEvaluating(false);
      return;
    }
    
    // For default template, just show {} without evaluating
    if (codeContent === DEFAULT_CODE_TEMPLATE) {
      setPreviewValue({});
      setPreviewError(null);
      setIsEvaluating(false);
      lastEvaluatedCodeRef.current = codeContent;
      return;
    }
    
    // Skip if code hasn't changed
    if (codeContent === lastEvaluatedCodeRef.current) {
      return;
    }
    
    setIsEvaluating(true);
    // Don't clear preview - keep showing previous value until new one is ready
    
    const timer = setTimeout(async () => {
      try {
        const result = await evaluateTemplate(codeContent, stepData, loopData);
        lastEvaluatedCodeRef.current = codeContent;
        if (result.success) {
          setPreviewValue(result.value);
          setPreviewError(null);
        } else {
          setPreviewError(result.error || 'Evaluation failed');
        }
      } catch (error) {
        setPreviewError(error instanceof Error ? error.message : String(error));
      } finally {
        setIsEvaluating(false);
      }
    }, 500);

    return () => clearTimeout(timer);
  }, [codeContent, stepData, loopData, open, canExecute, hasStepData]);

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

  const credentials = stepData && typeof stepData === 'object'
    ? Object.entries(stepData).reduce((acc, [key, value]) => {
        const pattern = /^[a-zA-Z_$][a-zA-Z0-9_$]*_[a-zA-Z0-9_$]+$/;
        if (pattern.test(key) && typeof value === 'string' && value.length > 0) {
          acc[key] = value;
        }
        return acc;
      }, {} as Record<string, string>)
    : undefined;

  const previewDisplayRaw = formatValueForDisplay(previewValue);
  const previewDisplay = credentials ? maskCredentials(previewDisplayRaw, credentials) : previewDisplayRaw;
  const canDownload = previewDisplayRaw.length > 1000;

  const handlePreviewEditorMount = useCallback((editor: Monaco.editor.IStandaloneCodeEditor) => {
    previewEditorRef.current = editor;
    onMount(editor);
    
    const updatePreviewHeight = () => {
      if (!editor) return;
      
      const lineCount = Math.max(1, editor.getModel()?.getLineCount() || 1);
      const contentHeight = lineCount * LINE_HEIGHT + EDITOR_PADDING;
      const calculatedHeight = Math.max(MIN_EDITOR_HEIGHT, Math.min(contentHeight, MAX_PREVIEW_HEIGHT));
      setPreviewHeight(calculatedHeight);
      
      setTimeout(() => {
        editor.layout();
      }, 0);
    };
    
    updatePreviewHeight();
    editor.onDidChangeModelContent(() => {
      updatePreviewHeight();
    });
  }, [onMount, LINE_HEIGHT, EDITOR_PADDING, MIN_EDITOR_HEIGHT, MAX_PREVIEW_HEIGHT]);

  useEffect(() => {
    if (!previewDisplay || !previewEditorRef.current) {
      const lines = previewDisplay ? Math.max(1, previewDisplay.split('\n').length) : 1;
      const contentHeight = lines * LINE_HEIGHT + EDITOR_PADDING;
      const calculatedHeight = Math.max(MIN_EDITOR_HEIGHT, Math.min(contentHeight, MAX_PREVIEW_HEIGHT));
      setPreviewHeight(calculatedHeight);
      return;
    }
    
    const editor = previewEditorRef.current;
    const lineCount = Math.max(1, editor.getModel()?.getLineCount() || previewDisplay.split('\n').length);
    const contentHeight = lineCount * LINE_HEIGHT + EDITOR_PADDING;
    const calculatedHeight = Math.max(MIN_EDITOR_HEIGHT, Math.min(contentHeight, MAX_PREVIEW_HEIGHT));
    setPreviewHeight(calculatedHeight);
    
    setTimeout(() => {
      editor.layout();
    }, 0);
  }, [previewDisplayRaw, previewValue, previewDisplay, LINE_HEIGHT, EDITOR_PADDING, MIN_EDITOR_HEIGHT, MAX_PREVIEW_HEIGHT]);

  const popoverWidth = Math.max(500, Math.min(editorWidth + 50, 900));

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

  const popoverRef = useRef<HTMLDivElement>(null);

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

  const popoverContent = (
    <div className="space-y-4">
      {/* Code Editor */}
      <div>
        <Label className="text-xs mb-2 block text-muted-foreground">
          Template Expression
        </Label>
        <div className="rounded-md border overflow-hidden transition-all duration-200 ease-in-out" style={{ height: `${editorHeight}px`, maxHeight: `${MAX_CODE_EDITOR_HEIGHT}px` }}>
          <Editor
            height={`${editorHeight}px`}
            defaultLanguage="javascript"
            value={codeContent}
            onChange={(val) => setCodeContent(val || '')}
            onMount={handleCodeEditorMount}
            options={{
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
            }}
            theme={theme}
          />
        </div>
      </div>

      {/* Result Preview */}
      <div>
        <div className="flex items-center justify-between mb-2">
          <Label className="text-xs text-muted-foreground">Result Preview</Label>
          <div className="flex items-center gap-2">
            {isEvaluating}
            {canDownload && !previewError && canExecute && hasStepData && (
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
        {!canExecute || !hasStepData ? (
          <div className="flex items-center gap-2 p-3 bg-muted/50 border border-muted-foreground/20 rounded-md text-xs text-muted-foreground">
            <AlertCircle className="h-4 w-4 shrink-0" />
            <span>Preview available when step inputs are provided</span>
          </div>
        ) : previewError ? (
          <div className="p-3 bg-destructive/10 border border-destructive/20 rounded-md text-xs text-destructive max-h-24 overflow-auto">
            {previewError}
          </div>
        ) : isEvaluating || previewValue === null ? (
          <div className="flex items-center justify-center p-3 bg-muted/30 border rounded-md">
            <div className="h-2 w-2 animate-spin rounded-full border-2 border-muted-foreground border-t-transparent" />
          </div>
        ) : (
          <div className="relative rounded-md border bg-muted/30 overflow-hidden transition-all duration-200 ease-in-out" style={{ height: `${previewHeight}px`, maxHeight: `${MAX_PREVIEW_HEIGHT}px` }}>
            <Editor
              height={`${previewHeight}px`}
              defaultLanguage="json"
              value={previewDisplay}
              onMount={handlePreviewEditorMount}
              options={{
                readOnly: true,
                minimap: { enabled: false },
                fontSize: 11,
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
                padding: { top: 8, bottom: 8 },
                automaticLayout: true,
              }}
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

  // When anchorRect is provided, render directly with fixed positioning via Portal
  if (anchorRect && open) {
    const wouldOverflowRight = anchorRect.left + popoverWidth > window.innerWidth - 16;
    const left = wouldOverflowRight ? anchorRect.left - popoverWidth : anchorRect.left;
    
    return createPortal(
      <div
        ref={popoverRef}
        className="fixed z-50 rounded-md border bg-popover p-4 text-popover-foreground shadow-md animate-in fade-in-0 zoom-in-95"
        style={{
          left: Math.max(16, left),
          top: anchorRect.top,
          width: `${popoverWidth}px`,
          maxWidth: '90vw',
        }}
      >
        {popoverContent}
      </div>,
      document.body
    );
  }

  // When children are provided, use Radix Popover with trigger
  if (children) {
    return (
      <Popover open={open} onOpenChange={readOnly ? undefined : setOpen} modal={false}>
        <PopoverTrigger asChild>
          {children}
        </PopoverTrigger>
        <PopoverContent 
          className="p-4"
          align="start" 
          side="bottom"
          sideOffset={4}
          style={{ width: `${popoverWidth}px`, maxWidth: '90vw' }}
        >
          {popoverContent}
        </PopoverContent>
      </Popover>
    );
  }

  // No children and no anchorRect - nothing to render
  return null;
}
