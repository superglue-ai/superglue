import { Button } from '@/src/components/ui/button';
import { formatBytes, type UploadedFileInfo } from '@/src/lib/file-utils';
import { cn } from '@/src/lib/general-utils';
import { File, FileArchive, FileCode, FileJson, FileSpreadsheet, FileText, X } from 'lucide-react';

interface FileChipProps {
    file: UploadedFileInfo;
    onRemove?: (key: string) => void;

    size?: 'compact' | 'default' | 'large';
    rounded?: 'none' | 'sm' | 'md' | 'full';

    showOriginalName?: boolean;
    showSize?: boolean;
    showKey?: boolean;

    maxWidth?: string;
    className?: string;
}

const getFileIcon = (filename: string) => {
    const ext = filename.toLowerCase().split('.').pop() || '';
    switch (ext) {
        case 'json': return FileJson;
        case 'csv': return FileSpreadsheet;
        case 'xml': return FileCode;
        case 'xlsx': return FileSpreadsheet;
        case 'xls': return FileSpreadsheet;
        case 'pdf': return FileText;
        case 'txt': return FileText;
        case 'md': return FileCode;
        case 'zip': return FileArchive;
        default: return File;
    }
};

export function FileChip({
    file,
    onRemove,
    size = 'default',
    rounded = 'md',
    showOriginalName = false,
    showSize = true,
    showKey = false,
    maxWidth,
    className
}: FileChipProps) {
    const FileIcon = getFileIcon(file.name);
    const displayName = showOriginalName ? file.name : file.key;

    // Handle cases where size or status might not be available
    const fileSize = file.size || 0;
    const fileStatus = file.status || 'ready';

    const sizeText = showSize && fileSize > 0 ? formatBytes(fileSize) : '';
    const keyText = showKey && showOriginalName ? ` • ${file.key}` : '';

    const subtitleText = fileStatus === 'processing'
        ? 'Parsing...'
        : fileStatus === 'error'
            ? file.error || 'Failed to parse'
            : `${sizeText}${keyText}`;

    const roundedClass = {
        'none': 'rounded-none',
        'sm': 'rounded-sm',
        'md': 'rounded-md',
        'full': 'rounded-full'
    }[rounded];

    const sizeStyles = size === 'compact'
        ? 'px-2 py-1.5'
        : size === 'large'
            ? 'px-4 py-3'
            : 'px-3 py-2';

    return (
        <div
            className={cn(
                "flex items-center justify-between transition-all border",
                roundedClass,
                sizeStyles,
                fileStatus === 'error'
                    ? "bg-destructive/10 border-destructive/20"
                    : fileStatus === 'processing'
                        ? "bg-amber-50 dark:bg-amber-950/30 border-amber-200 dark:border-amber-800"
                        : "bg-muted/30 border-border",
                className
            )}
            style={maxWidth ? { maxWidth } : undefined}
        >
            <div className="flex items-center gap-2 min-w-0 flex-1">
                <FileIcon className="h-4 w-4 text-gray-700 dark:text-gray-400 flex-shrink-0" />
                <div className="flex flex-col min-w-0 flex-1">
                    <span className="text-xs font-medium truncate" title={file.name}>
                        {displayName}
                    </span>
                    {subtitleText && (
                        <span className="text-[10px] text-muted-foreground">
                            {subtitleText}
                        </span>
                    )}
                </div>
            </div>
            <div className="flex items-center gap-1 ml-2">
                {fileStatus === 'processing' && (
                    <div className="h-3 w-3 animate-spin rounded-full border-2 border-amber-600 dark:border-amber-400 border-t-transparent" />
                )}
                {onRemove && fileStatus !== 'processing' && (
                    <Button
                        variant="ghost"
                        size="icon"
                        className="h-6 w-6 hover:bg-background/80"
                        onClick={() => onRemove(file.key)}
                    >
                        <X className="h-3 w-3" />
                    </Button>
                )}
            </div>
        </div>
    );
}

