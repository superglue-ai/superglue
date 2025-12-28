import { useMonacoTheme } from '@superglue/web/src/hooks/use-monaco-theme';
import Editor from '@monaco-editor/react';
import React, { useMemo } from 'react';
import { CopyButton } from '../tools/shared/CopyButton';

interface CodeSnippetProps {
  code: string;
  language: 'javascript' | 'typescript' | 'python' | 'bash' | 'shell' | 'json';
}

export const CodeSnippet = React.memo(({ 
  code, 
  language
}: CodeSnippetProps) => {
  const { theme, onMount } = useMonacoTheme();

  const height = useMemo(() => {
    const lines = code.split('\n').length;
    const lineHeight = 18;
    const basePadding = 16;
    
    // Multi-line bash/shell commands need significantly more space
    let extraPadding = 0;
    if ((language === 'bash' || language === 'shell') && lines > 1) {
      extraPadding = 18;
    }
    
    return `${lines * lineHeight + basePadding + extraPadding}px`;
  }, [code, language]);

  const lines = useMemo(() => code.split('\n').length, [code]);

  return (
    <div className="relative bg-secondary rounded-md border overflow-hidden">
      <div className={`absolute right-2 z-10 ${lines === 1 ? 'top-1/2 -translate-y-1/2' : 'top-2'}`}>
        <CopyButton text={code} />
      </div>
      <div className="overflow-hidden px-2">
        <Editor
          height={height}
          defaultLanguage={language}
          value={code}
          onMount={onMount}
          options={{
            readOnly: true,
            minimap: { enabled: false },
            fontSize: 11,
            lineNumbers: 'off',
            glyphMargin: false,
            folding: false,
            lineDecorationsWidth: 0,
            lineNumbersMinChars: 0,
            scrollBeyondLastLine: false,
            scrollBeyondLastColumn: 0,
            wordWrap: 'on',
            contextmenu: false,
            renderLineHighlight: 'none',
            scrollbar: {
              vertical: 'hidden',
              horizontal: 'auto',
              verticalScrollbarSize: 0,
              horizontalScrollbarSize: 8,
              alwaysConsumeMouseWheel: false
            },
            overviewRulerLanes: 0,
            hideCursorInOverviewRuler: true,
            overviewRulerBorder: false,
            padding: { top: 8, bottom: 8 },
            lineHeight: 18,
            tabSize: 2,
            quickSuggestions: false,
            parameterHints: { enabled: false },
            codeLens: false,
            links: false,
            colorDecorators: false,
            occurrencesHighlight: 'off',
            renderValidationDecorations: 'off',
            stickyScroll: { enabled: false },
            domReadOnly: true,
            cursorStyle: 'line',
            fixedOverflowWidgets: true
          }}
          theme={theme}
          className="!bg-transparent"
        />
      </div>
    </div>
  );
});

CodeSnippet.displayName = 'CodeSnippet';

