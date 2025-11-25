import { Button } from '@/src/components/ui/button';
import { Input } from '@/src/components/ui/input';
import { Label } from '@/src/components/ui/label';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/src/components/ui/popover';
import { evaluateTemplate, formatValueForDisplay, isSimpleVariableReference } from '@/src/lib/template-utils';
import { Download } from 'lucide-react';
import { useEffect, useState } from 'react';
import Editor from '@monaco-editor/react';
import { useMonacoTheme } from '@/src/hooks/useMonacoTheme';

interface TemplateEditPopoverProps {
  template: string;
  stepData: any;
  loopData?: any;
  onSave: (newTemplate: string) => void;
  children: React.ReactNode;
  readOnly?: boolean;
}

export function TemplateEditPopover({
  template,
  stepData,
  loopData,
  onSave,
  children,
  readOnly = false
}: TemplateEditPopoverProps) {
  const [open, setOpen] = useState(false);
  const templateContent = template.replace(/^<<|>>$/g, '');
  const isSimpleRef = isSimpleVariableReference(templateContent);
  const { theme, onMount } = useMonacoTheme();
  
  const [editValue, setEditValue] = useState(templateContent);
  const [previewValue, setPreviewValue] = useState<any>(null);
  const [previewError, setPreviewError] = useState<string | null>(null);
  const [isEvaluating, setIsEvaluating] = useState(false);

  useEffect(() => {
    if (open) {
      setEditValue(templateContent);
    }
  }, [open, templateContent]);

  useEffect(() => {
    if (!open) return;
    
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
  }, [editValue, stepData, loopData, open]);

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

  const previewDisplay = formatValueForDisplay(previewValue);
  const canDownload = previewDisplay.length > 1000;

  return (
    <Popover open={open} onOpenChange={readOnly ? undefined : setOpen}>
      <PopoverTrigger asChild>
        {children}
      </PopoverTrigger>
      <PopoverContent className="w-[480px] p-4" align="start" side="bottom">
        <div className="space-y-4">
          <div>
            <Label className="text-xs mb-2 block text-muted-foreground">
              {isSimpleRef ? 'Variable Name' : 'Template Code'}
            </Label>
            {isSimpleRef ? (
              <Input
                value={editValue}
                onChange={(e) => setEditValue(e.target.value)}
                placeholder="variableName"
                className="font-mono text-sm h-9"
              />
            ) : (
              <div className="rounded-md border overflow-hidden">
                <Editor
                  height="120px"
                  defaultLanguage="javascript"
                  value={editValue}
                  onChange={(val) => setEditValue(val || '')}
                  onMount={onMount}
                  options={{
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
                {canDownload && !previewError && (
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
            {previewError ? (
              <div className="p-3 bg-destructive/10 border border-destructive/20 rounded-md text-xs text-destructive max-h-24 overflow-auto">
                {previewError}
              </div>
            ) : (
              <div className="rounded-md border bg-muted/30 overflow-hidden">
                <Editor
                  height="80px"
                  defaultLanguage="json"
                  value={previewDisplay.slice(0, 2000)}
                  onMount={onMount}
                  options={{
                    readOnly: true,
                    minimap: { enabled: false },
                    fontSize: 11,
                    lineNumbers: 'off',
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
                    },
                    overviewRulerLanes: 0,
                    padding: { top: 8, bottom: 8 },
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
