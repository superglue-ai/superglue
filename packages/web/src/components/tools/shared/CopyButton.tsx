import { Check, Copy } from 'lucide-react';
import { useState } from 'react';

export const CopyButton = ({ text, getData }: { text?: string; getData?: () => any }) => {
    const [copied, setCopied] = useState(false);
    const handleCopy = (e: React.MouseEvent) => {
        e.stopPropagation();
        e.preventDefault();
        const textToCopy = getData ? (typeof getData() === 'string' ? getData() : JSON.stringify(getData(), null, 2)) : (text || '');
        navigator.clipboard.writeText(textToCopy);
        setCopied(true);
        setTimeout(() => setCopied(false), 1500);
    };
    return (
        <button onClick={handleCopy} className="h-6 w-6 flex items-center justify-center rounded hover:bg-background/80 transition-colors bg-background/60 backdrop-blur" title="Copy" type="button">
            {copied ? <Check className="h-3 w-3 text-green-600" /> : <Copy className="h-3 w-3 text-muted-foreground" />}
        </button>
    );
};

