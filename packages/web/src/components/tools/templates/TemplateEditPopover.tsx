import { Button } from '@/src/components/ui/button';
import { Label } from '@/src/components/ui/label';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
  PopoverAnchor,
} from '@/src/components/ui/popover';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/src/components/ui/select';
import { evaluateTemplate, formatValueForDisplay, isSimpleVariableReference, isCredentialVariable, maskCredentialValue } from '@/src/lib/template-utils';
import { Download, Eye, EyeOff, Code2, Variable, AlertCircle } from 'lucide-react';
import { useEffect, useState, useRef, useCallback, useMemo } from 'react';
import Editor from '@monaco-editor/react';
import { useMonacoTheme } from '@/src/hooks/useMonacoTheme';
import { cn } from '@/src/lib/general-utils';
import type * as Monaco from 'monaco-editor';

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
  anchorRect?: { left: number; top: number } | null;
  initialMode?: 'variable' | 'code';
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
  anchorRect,
  initialMode,
}: TemplateEditPopoverProps) {
  const [internalOpen, setInternalOpen] = useState(false);
  const isControlled = externalOpen !== undefined;
  const open = isControlled ? externalOpen : internalOpen;
  const setOpen = isControlled ? (onExternalOpenChange ?? (() => {})) : setInternalOpen;

  useEffect(() => {
    console.log('[TemplateEditPopover] open changed to:', open, 'isControlled:', isControlled, 'anchorRect:', anchorRect);
  }, [open, isControlled, anchorRect]);

  const templateContent = template.replace(/^<<|>>$/g, '');
  const initialIsSimple = isSimpleVariableReference(templateContent);
  const { theme, onMount } = useMonacoTheme();
  
  const [editValue, setEditValue] = useState(templateContent);
  const [previewValue, setPreviewValue] = useState<any>(null);
  const [previewError, setPreviewError] = useState<string | null>(null);
  const [isEvaluating, setIsEvaluating] = useState(false);
  const [showCredential, setShowCredential] = useState(false);
  const LINE_HEIGHT = 19;
  const EDITOR_PADDING = 16;
  const MIN_EDITOR_HEIGHT = LINE_HEIGHT + EDITOR_PADDING;
  const MAX_CODE_EDITOR_HEIGHT = 300;
  const MAX_PREVIEW_HEIGHT = 250;
  
  const [previewHeight, setPreviewHeight] = useState(MIN_EDITOR_HEIGHT);
  const [mode, setMode] = useState<'variable' | 'code'>(initialMode ?? (initialIsSimple ? 'variable' : 'code'));
  const [editorWidth, setEditorWidth] = useState(600);
  const [editorHeight, setEditorHeight] = useState(MIN_EDITOR_HEIGHT);
  
  const codeEditorRef = useRef<Monaco.editor.IStandaloneCodeEditor | null>(null);
  const previewEditorRef = useRef<Monaco.editor.IStandaloneCodeEditor | null>(null);
  
  const isCredential = isCredentialVariable(templateContent, stepData);
  const hasStepData = stepData && typeof stepData === 'object' && Object.keys(stepData).length > 0;

  const availableVariables = useMemo(() => {
    if (!stepData || typeof stepData !== 'object') return [];
    return Object.keys(stepData).sort();
  }, [stepData]);

  const calculateEditorDimensions = useCallback((content: string) => {
    if (!content) {
      return { width: 600, height: MIN_EDITOR_HEIGHT };
    }
    
    const lines = content.split('\n');
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
  }, []);

  const handleCodeEditorMount = useCallback((editor: Monaco.editor.IStandaloneCodeEditor) => {
    codeEditorRef.current = editor;
    onMount(editor);
    
    const updateDimensions = () => {
      if (!editor) return;
      const content = editor.getValue();
      const dimensions = calculateEditorDimensions(content);
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
  }, [onMount, calculateEditorDimensions]);

  useEffect(() => {
    if (open) {
      setShowCredential(false);
      if (initialMode) {
        setMode(initialMode);
        if (initialMode === 'code' && !templateContent) {
          const defaultCode = '(sourceData) => sourceData.';
          setEditValue(defaultCode);
          const dimensions = calculateEditorDimensions(defaultCode);
          setEditorWidth(dimensions.width);
          setEditorHeight(dimensions.height);
        } else {
          setEditValue(templateContent);
          const dimensions = calculateEditorDimensions(templateContent);
          setEditorWidth(dimensions.width);
          setEditorHeight(dimensions.height);
        }
      } else {
        setEditValue(templateContent);
        setMode(isSimpleVariableReference(templateContent) ? 'variable' : 'code');
        const dimensions = calculateEditorDimensions(templateContent);
        setEditorWidth(dimensions.width);
        setEditorHeight(dimensions.height);
      }
    }
  }, [open, templateContent, calculateEditorDimensions, initialMode]);

  useEffect(() => {
    if (mode === 'code') {
      const dimensions = calculateEditorDimensions(editValue);
      setEditorWidth(dimensions.width);
      setEditorHeight(dimensions.height);
      
      if (codeEditorRef.current) {
        setTimeout(() => {
          codeEditorRef.current?.layout();
        }, 0);
      }
    }
  }, [editValue, mode, calculateEditorDimensions]);

  useEffect(() => {
    if (!open || !canExecute || !hasStepData) {
      setPreviewValue(null);
      setPreviewError(null);
      return;
    }
    
    const timer = setTimeout(async () => {
      setIsEvaluating(true);
      try {
        const result = await evaluateTemplate(editValue, stepData, loopData);
        if (result.success) {
          setPreviewValue(result.value);
          setPreviewError(null);
        } else {
          setPreviewValue(null);
          setPreviewError(result.error || 'Evaluation failed');
        }
      } catch (error) {
        setPreviewError(error instanceof Error ? error.message : String(error));
        setPreviewValue(null);
      } finally {
        setIsEvaluating(false);
      }
    }, 300);

    return () => clearTimeout(timer);
  }, [editValue, stepData, loopData, open, canExecute, hasStepData]);

  const handleSave = () => {
    const newTemplate = `<<${editValue}>>`;
    onSave(newTemplate);
    setOpen(false);
  };

  const handleDownload = () => {
    const content = formatValueForDisplay(previewValue);
    const blob = new Blob([content], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `template-result.txt`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const previewDisplayRaw = formatValueForDisplay(previewValue);
  const previewDisplay = isCredential && typeof previewValue === 'string' && !showCredential
    ? maskCredentialValue(previewValue)
    : previewDisplayRaw;
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
  }, [onMount]);

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
  }, [previewDisplayRaw, showCredential, isCredential, previewValue, previewDisplay]);

  const anchorStyle = anchorRect ? {
    position: 'fixed' as const,
    left: anchorRect.left,
    top: anchorRect.top,
    width: 1,
    height: 1,
    pointerEvents: 'none' as const,
  } : undefined;

  return (
    <Popover open={open} onOpenChange={readOnly ? undefined : setOpen} modal={false}>
      {children ? (
        <PopoverTrigger asChild>
          {children}
        </PopoverTrigger>
      ) : (
        <PopoverAnchor>
          <div style={anchorStyle} />
        </PopoverAnchor>
      )}
      <PopoverContent 
        className="p-4" 
        align="start" 
        side="bottom"
        onOpenAutoFocus={(e) => {
          if (anchorRect) {
            e.preventDefault();
          }
        }}
        onInteractOutside={(e) => {
          if (anchorRect) {
            e.preventDefault();
          }
        }}
        style={{ width: `${Math.max(600, Math.min(editorWidth + 80, 1200))}px`, maxWidth: '90vw' }}
      >
        <div className="space-y-4">
          <div>
            <div className="flex items-center justify-between mb-2">
              <Label className="text-xs text-muted-foreground">
                {mode === 'variable' ? 'Variable Name' : 'Template Code'}
              </Label>
              <div className="flex items-center gap-1 p-0.5 bg-muted rounded-md">
                <button
                  type="button"
                  onClick={() => {
                    if (mode === 'code') {
                      const match = editValue.match(/^\(sourceData\)\s*=>\s*sourceData\.(\w+)$/);
                      if (match && availableVariables.includes(match[1])) {
                        setEditValue(match[1]);
                      } else if (availableVariables.length > 0) {
                        setEditValue(availableVariables[0]);
                      } else {
                        setEditValue('');
                      }
                    }
                    setMode('variable');
                  }}
                  className={cn(
                    "flex items-center gap-1 px-2 py-1 rounded text-xs transition-colors",
                    mode === 'variable' 
                      ? "bg-background shadow-sm text-foreground" 
                      : "text-muted-foreground hover:text-foreground"
                  )}
                >
                  <Variable className="h-3 w-3" />
                  Variable
                </button>
                <button
                  type="button"
                  onClick={() => {
                    if (mode === 'variable' && editValue && availableVariables.includes(editValue)) {
                      setEditValue(`(sourceData) => sourceData.${editValue}`);
                    } else if (mode === 'variable' && !editValue) {
                      setEditValue('(sourceData) => sourceData.');
                    }
                    setMode('code');
                  }}
                  className={cn(
                    "flex items-center gap-1 px-2 py-1 rounded text-xs transition-colors",
                    mode === 'code' 
                      ? "bg-background shadow-sm text-foreground" 
                      : "text-muted-foreground hover:text-foreground"
                  )}
                >
                  <Code2 className="h-3 w-3" />
                  Code
                </button>
              </div>
            </div>
            {mode === 'variable' ? (
              <Select value={editValue} onValueChange={setEditValue}>
                <SelectTrigger className="font-mono text-sm h-9">
                  <SelectValue placeholder="Select a variable..." />
                </SelectTrigger>
                <SelectContent>
                  {availableVariables.length === 0 ? (
                    <div className="px-2 py-1.5 text-xs text-muted-foreground">
                      No variables available
                    </div>
                  ) : (
                    availableVariables.map((varName) => (
                      <SelectItem key={varName} value={varName} className="font-mono text-sm">
                        {varName}
                      </SelectItem>
                    ))
                  )}
                </SelectContent>
              </Select>
            ) : (
              <div className="rounded-md border overflow-hidden transition-all duration-200 ease-in-out" style={{ height: `${editorHeight}px`, maxHeight: `${MAX_CODE_EDITOR_HEIGHT}px` }}>
                <Editor
                  height={`${editorHeight}px`}
                  defaultLanguage="javascript"
                  value={editValue}
                  onChange={(val) => setEditValue(val || '')}
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
            )}
          </div>

          <div>
            <div className="flex items-center justify-between mb-2">
              <Label className="text-xs text-muted-foreground">Preview</Label>
              <div className="flex items-center gap-2">
                {isEvaluating && (
                  <div className="h-3 w-3 animate-spin rounded-full border-2 border-muted-foreground border-t-transparent" />
                )}
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
            ) : (
              <div className="relative rounded-md border bg-muted/30 overflow-hidden transition-all duration-200 ease-in-out" style={{ height: `${previewHeight}px`, maxHeight: `${MAX_PREVIEW_HEIGHT}px` }}>
                {isCredential && !previewError && (
                  <div className="absolute top-2 right-2 z-10">
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => setShowCredential(!showCredential)}
                      className="h-6 text-xs px-2 bg-background border border-border hover:bg-muted shadow-sm"
                      title={showCredential ? 'Hide credential' : 'Show credential'}
                    >
                      {showCredential ? (
                        <EyeOff className="h-3 w-3" />
                      ) : (
                        <Eye className="h-3 w-3" />
                      )}
                    </Button>
                  </div>
                )}
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
            <Button size="sm" onClick={handleSave} disabled={!!previewError} className="h-8 text-xs">
              Save
            </Button>
          </div>
        </div>
      </PopoverContent>
    </Popover>
  );
}
