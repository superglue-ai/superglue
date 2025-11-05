export enum SupportedFileType {
    JSON = 'JSON',
    CSV = 'CSV',
    XML = 'XML',
    EXCEL = 'EXCEL',
    PDF = 'PDF',
    DOCX = 'DOCX',
    ZIP = 'ZIP',
    RAW = 'RAW',
    AUTO = 'AUTO'
}

export enum DecompressionMethod {
    NONE = 'NONE',
    AUTO = 'AUTO',
    GZIP = 'GZIP',
    DEFLATE = 'DEFLATE',
    ZIP = 'ZIP'
}

export const ALLOWED_FILE_EXTENSIONS = [
    '.json', '.csv', '.txt', '.xml',
    '.xlsx', '.xls', '.xlsb',
    '.pdf', '.docx', '.doc',
    '.zip', '.gz'
] as const;

export type AllowedFileExtension = typeof ALLOWED_FILE_EXTENSIONS[number];

