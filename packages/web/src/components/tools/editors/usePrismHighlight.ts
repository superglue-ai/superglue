import Prism from 'prismjs';
import 'prismjs/components/prism-javascript';
import 'prismjs/components/prism-json';
import { useEffect, useMemo, useRef, useState } from 'react';

export function usePrismHighlight(code: string, language: 'javascript' | 'json', delayMs = 40): string {
    const [html, setHtml] = useState<string>('');
    const lastHtmlRef = useRef<string>('');
    const highlightFn = useMemo(() => {
        return (c: string) => {
            try {
                const lang = language === 'javascript' ? Prism.languages.javascript : Prism.languages.json;
                return Prism.highlight(c, lang, language);
            } catch {
                return c;
            }
        };
    }, [language]);

    useEffect(() => {
        let cancelled = false;
        let cancel: (() => void) | null = null;
        const schedule = (fn: () => void) => {
            const w: any = window as any;
            if (typeof w.requestIdleCallback === 'function') {
                const id = w.requestIdleCallback(fn, { timeout: delayMs });
                return () => w.cancelIdleCallback?.(id);
            }
            const id = window.requestAnimationFrame(fn);
            return () => window.cancelAnimationFrame(id);
        };

        cancel = schedule(() => {
            if (cancelled) return;
            const next = highlightFn(code);
            if (!cancelled) {
                lastHtmlRef.current = next;
                setHtml(next);
            }
        });

        return () => {
            cancelled = true;
            cancel?.();
        };
    }, [code, highlightFn, delayMs]);

    return html || lastHtmlRef.current || code;
}

