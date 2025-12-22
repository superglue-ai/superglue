import { Button } from '@/src/components/ui/button';
import { formatBytes, type UploadedFileInfo } from '@/src/lib/file-utils';
import { cn } from '@/src/lib/general-utils';
import { File, FileArchive, FileCode, FileJson, FileSpreadsheet, FileText, X, FileDigit, FileImage, FileType, FileMusic, Loader2 } from 'lucide-react';

interface FileChipProps {
    file: UploadedFileInfo;
    onRemove?: (key: string) => void;

    size?: 'compact' | 'default' | 'large';
    rounded?: 'none' | 'sm' | 'md' | 'full';

    showOriginalName?: boolean;
    showSize?: boolean;
    showKey?: boolean;
    isLoading?: boolean;

    maxWidth?: string;
    className?: string;
}

const getFileIcon = (filename: string) => {
    const ext = filename.toLowerCase().split('.').pop() || '';
    switch (ext) {
        // JSON
        case 'json': return FileJson;
        
        // Spreadsheets
        case 'csv': return FileSpreadsheet;
        case 'xlsx': return FileSpreadsheet;
        case 'xls': return FileSpreadsheet;
        
        // Programming languages
        case 'py': return FileCode;
        case 'js': return FileCode;
        case 'ts': return FileCode;
        case 'tsx': return FileCode;
        case 'jsx': return FileCode;
        case 'java': return FileCode;
        case 'cpp': return FileCode;
        case 'c': return FileCode;
        case 'go': return FileCode;
        case 'rs': return FileCode;
        case 'rb': return FileCode;
        case 'php': return FileCode;
        case 'swift': return FileCode;
        case 'kt': return FileCode;
        case 'xml': return FileCode;
        case 'html': return FileCode;
        case 'css': return FileCode;
        
        // Text files
        case 'txt': return FileType;
        case 'md': return FileType;
        
        // PDF
        case 'pdf': return File;
        
        // Images
        case 'png': return FileImage;
        case 'jpg': return FileImage;
        case 'jpeg': return FileImage;
        case 'gif': return FileImage;
        case 'svg': return FileImage;
        case 'webp': return FileImage;
        
        // Audio
        case 'mp3': return FileMusic;
        case 'wav': return FileMusic;
        case 'ogg': return FileMusic;
        case 'm4a': return FileMusic;
        
        // Binary
        case 'bin': return FileDigit;
        case 'exe': return FileDigit;
        case 'dll': return FileDigit;
        
        // Archives
        case 'zip': return FileArchive;
        case 'tar': return FileArchive;
        case 'gz': return FileArchive;
        case 'rar': return FileArchive;
        case '7z': return FileArchive;
        
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
    isLoading = false,
    maxWidth,
    className
}: FileChipProps) {
    const FileIcon = getFileIcon(file.name);
    const displayName = showOriginalName ? file.name : file.key;

    // Handle cases where size or status might not be available
    const fileSize = file.size || 0;
    const fileStatus = file.status || 'ready';

    const sizeText = showSize && fileSize > 0 ? formatBytes(fileSize) : '';
    const keyText = showKey && showOriginalName ? ` • JSON Input Key: ${file.key}` : '';

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
            <div className="flex items-center gap-1 ml-2 relative group/actions">
                {(fileStatus === 'processing' || isLoading) && (
                    <Loader2 className="h-3.5 w-3.5 animate-spin text-gray-400 dark:text-gray-500 group-hover/actions:opacity-0 transition-opacity" />
                )}
                {onRemove && (
                    <Button
                        variant="ghost"
                        size="icon"
                        className={cn(
                            "h-6 w-6 hover:bg-background/80",
                            (fileStatus === 'processing' || isLoading) ? "absolute opacity-0 group-hover/actions:opacity-100 transition-opacity" : ""
                        )}
                        onClick={() => onRemove(file.key)}
                    >
                        <X className="h-3 w-3" />
                    </Button>
                )}
            </div>
        </div>
    );
}
