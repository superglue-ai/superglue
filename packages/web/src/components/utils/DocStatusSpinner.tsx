import { CheckCircle, Loader2, XCircle } from 'lucide-react';
import React from 'react';

interface DocStatusProps {
    pending: boolean;
    hasDocumentation: boolean;
    message?: string;
    size?: number;
    className?: string;
}

export const DocStatus: React.FC<DocStatusProps> = ({
    pending,
    hasDocumentation,
    message,
    size = 16,
    className = '',
}) => {
    if (pending) {
        return (
            <span className={`inline-flex items-center gap-1 text-blue-600 dark:text-blue-300 text-xs bg-blue-500/10 px-2 py-0.5 rounded ${className}`} title="Documentation is being fetched">
                <Loader2 className="h-3 w-3 animate-spin" />
                <span>{message || 'Processing docs...'}</span>
            </span>
        );
    }

    if (hasDocumentation) {
        return (
            <span className={`inline-flex items-center gap-1 text-green-800 dark:text-green-300 text-xs bg-green-500/10 px-2 py-0.5 rounded ${className}`} title="Documentation is available">
                <CheckCircle className="h-3 w-3" />
                <span>{message || 'Docs ready'}</span>
            </span>
        );
    }

    return (
        <span className={`inline-flex items-center gap-1 text-amber-800 dark:text-amber-300 text-xs bg-amber-500/10 px-2 py-0.5 rounded ${className}`} title="Documentation is missing or empty">
            <XCircle className="h-3 w-3" />
            <span>{message || 'No docs'}</span>
        </span>
    );
}; 