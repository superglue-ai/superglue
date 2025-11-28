import { loader } from '@monaco-editor/react';
import type * as Monaco from 'monaco-editor';
import { useCallback, useEffect, useRef, useState } from 'react';

let themeInitialized = false;
let observerInitialized = false;
const editorInstances = new Set<Monaco.editor.IStandaloneCodeEditor>();

function getCurrentTheme(): 'light' | 'dark' {
  if (typeof document === 'undefined') return 'dark';
  return document.documentElement.classList.contains('dark') ? 'dark' : 'light';
}

function defineThemes(monaco: typeof Monaco | any) {
  if (themeInitialized) return;
  
  monaco.editor.defineTheme('superglue-light', {
    base: 'vs',
    inherit: true,
    rules: [
      { token: 'comment', foreground: '6A737D', fontStyle: 'italic' },
      { token: 'keyword', foreground: 'C678DD' },
      { token: 'string', foreground: '50A14F' },
      { token: 'number', foreground: '0184BC' },
      { token: 'regexp', foreground: 'E45649' },
      { token: 'operator', foreground: '383A42' },
      { token: 'delimiter', foreground: '383A42' },
      { token: 'type', foreground: '0997B3' },
      { token: 'function', foreground: '4078F2' },
      { token: 'variable', foreground: 'E45649' },
      { token: 'constant', foreground: '986801' },
    ],
    colors: {
      'editor.background': '#00000000',
      'editor.foreground': '#383A42',
      'editorLineNumber.foreground': '#9D9D9F',
      'editorCursor.foreground': '#526FFF',
      'editor.selectionBackground': '#E5E5E6',
      'editor.inactiveSelectionBackground': '#EAEAEB',
    }
  });

  monaco.editor.defineTheme('superglue-dark', {
    base: 'vs-dark',
    inherit: true,
    rules: [
      { token: 'comment', foreground: '6A737D', fontStyle: 'italic' },
      { token: 'keyword', foreground: 'C678DD' },
      { token: 'string', foreground: '98C379' },
      { token: 'number', foreground: '61AFEF' },
      { token: 'regexp', foreground: 'E06C75' },
      { token: 'operator', foreground: 'ABB2BF' },
      { token: 'delimiter', foreground: 'ABB2BF' },
      { token: 'type', foreground: '56B6C2' },
      { token: 'function', foreground: '61AFEF' },
      { token: 'variable', foreground: 'E06C75' },
      { token: 'constant', foreground: 'D19A66' },
    ],
    colors: {
      'editor.background': '#00000000',
      'editor.foreground': '#ABB2BF',
      'editorLineNumber.foreground': '#5C6370',
      'editorCursor.foreground': '#528BFF',
      'editor.selectionBackground': '#3E4451',
      'editor.inactiveSelectionBackground': '#2C313A',
    }
  });

  themeInitialized = true;
}

function updateAllEditorsTheme(theme: 'light' | 'dark') {
  const themeName = theme === 'dark' ? 'superglue-dark' : 'superglue-light';
  loader.init().then((monaco) => {
    defineThemes(monaco);
    monaco.editor.setTheme(themeName);
    editorInstances.forEach((editor) => {
      editor.updateOptions({ theme: themeName });
    });
  });
}

function initThemeObserver() {
  if (observerInitialized || typeof window === 'undefined') return;
  observerInitialized = true;
  
  const observer = new MutationObserver((mutations) => {
    for (const mutation of mutations) {
      if (mutation.type === 'attributes' && mutation.attributeName === 'class') {
        updateAllEditorsTheme(getCurrentTheme());
        break;
      }
    }
  });
  
  observer.observe(document.documentElement, {
    attributes: true,
    attributeFilter: ['class'],
  });
}

export function useMonacoTheme() {
  const [currentTheme, setCurrentTheme] = useState<'light' | 'dark'>(getCurrentTheme);
  const editorRef = useRef<Monaco.editor.IStandaloneCodeEditor | null>(null);

  useEffect(() => {
    initThemeObserver();
    
    loader.init().then((monaco) => {
      defineThemes(monaco);
      const theme = getCurrentTheme();
      setCurrentTheme(theme);
      monaco.editor.setTheme(theme === 'dark' ? 'superglue-dark' : 'superglue-light');
    });
  }, []);

  const handleEditorMount = useCallback((editor: Monaco.editor.IStandaloneCodeEditor) => {
    editorRef.current = editor;
    editorInstances.add(editor);
    
    loader.init().then((monaco) => {
      defineThemes(monaco);
      const theme = getCurrentTheme();
      const themeName = theme === 'dark' ? 'superglue-dark' : 'superglue-light';
      editor.updateOptions({ theme: themeName });
    });
    
    return () => {
      editorInstances.delete(editor);
    };
  }, []);

  const themeName = currentTheme === 'dark' ? 'superglue-dark' : 'superglue-light';
  
  return {
    theme: themeName,
    onMount: handleEditorMount,
  };
}