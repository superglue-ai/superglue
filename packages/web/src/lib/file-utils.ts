export const MAX_TOTAL_FILE_SIZE = 100 * 1024 * 1024; // 100MB total
export const ALLOWED_EXTENSIONS = ['.json', '.csv', '.txt', '.xml', '.xlsx', '.xls'];

export function isAllowedFileType(filename: string): boolean {
    const ext = filename.toLowerCase().split('.').pop();
    return ALLOWED_EXTENSIONS.includes(`.${ext}`);
}

export function sanitizeFileName(name: string): string {
    // Remove extension
    let base = name.replace(/\.[^/.]+$/, '');

    // Replace special characters with underscores
    base = base.replace(/[^a-zA-Z0-9_]/g, '_');

    // Ensure doesn't start with number
    if (/^\d/.test(base)) {
        base = '_' + base;
    }

    // Ensure not empty
    if (!base) {
        base = 'file';
    }

    return base;
}

export function generateUniqueKey(baseKey: string, existingKeys: string[]): string {
    if (!existingKeys.includes(baseKey)) {
        return baseKey;
    }

    let counter = 1;
    let uniqueKey = `${baseKey}_${counter}`;
    while (existingKeys.includes(uniqueKey)) {
        counter++;
        uniqueKey = `${baseKey}_${counter}`;
    }

    return uniqueKey;
}

export function formatBytes(bytes: number): string {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return `${parseFloat((bytes / Math.pow(k, i)).toFixed(1))} ${sizes[i]}`;
}

export interface UploadedFileInfo {
    name: string;
    size: number;
    key: string;
    status: 'processing' | 'ready' | 'error';
    error?: string;
}
