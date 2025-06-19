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
            <span className={`inline-flex items-center gap-1 text-blue-600 text-xs font-medium bg-blue-500/10 px-2 py-0.5 rounded ${className}`} title="Documentation is being fetched">
                <Loader2 className="animate-spin" width={size} height={size} />
                <span>{message || 'Processing docs...'}</span>
            </span>
        );
    }

    if (hasDocumentation) {
        return (
            <span className={`inline-flex items-center gap-1 text-green-600 text-xs font-medium bg-green-500/10 px-2 py-0.5 rounded ${className}`} title="Documentation is available">
                <CheckCircle width={size} height={size} />
                <span>{message || 'Docs ready'}</span>
            </span>
        );
    }

    return (
        <span className={`inline-flex items-center gap-1 text-red-600 text-xs font-medium bg-red-500/10 px-2 py-0.5 rounded ${className}`} title="Documentation is missing or empty">
            <XCircle width={size} height={size} />
            <span>{message || 'No docs'}</span>
        </span>
    );
}; 