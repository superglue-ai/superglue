import * as JSZip from 'jszip';
import * as mammoth from 'mammoth';
import * as pdfjsLib from 'pdfjs-dist';

pdfjsLib.GlobalWorkerOptions.workerSrc = `https://cdnjs.cloudflare.com/ajax/libs/pdf.js/${pdfjsLib.version}/pdf.worker.min.mjs`;

// Context-specific file size limits
export const MAX_FILE_SIZE_CHAT = 50 * 1024 * 1024;           // 50 MB per message for chat (performance)
export const MAX_FILE_SIZE_DOCUMENTATION = 50 * 1024 * 1024;  // 50 MB for documentation (processing limits)
export const MAX_FILE_SIZE_TOOLS = 1000 * 1024 * 1024;        // 1000 MB for tool creation/playground
export const MAX_FILE_PAYLOAD_PER_MESSAGE = 50 * 1024 * 1024; // 50 MB total extracted content per message

export const ALLOWED_EXTENSIONS = ['.json', '.csv', '.txt', '.xml', '.xlsx', '.xls', '.pdf'];

export interface UploadedFileInfo {
    name: string;
    size?: number;  // Optional for cases where size is unknown (e.g., from file:// URLs)
    key: string;
    status?: 'processing' | 'ready' | 'error';  // Optional, defaults to 'ready'
    error?: string;
}

export function isAllowedFileType(filename: string): boolean {
    const ext = filename.toLowerCase().split('.').pop();
    return ALLOWED_EXTENSIONS.includes(`.${ext}`);
}

export function needsFrontendProcessing(filename: string): boolean {
    const lower = filename.toLowerCase();
    return lower.endsWith('.pdf') || lower.endsWith('.zip');
}

export async function processAndExtractFile(file: File, client: any): Promise<any> {
    if (needsFrontendProcessing(file.name)) {
        return await processFile(file, file.name);
    } else {
        const extractResult = await client.extract({ file });
        if (!extractResult.success) {
            throw new Error(extractResult.error || 'Failed to extract data');
        }
        return extractResult.data;
    }
}

export function sanitizeFileName(name: string, options?: {
  removeExtension?: boolean;
  lowercase?: boolean;
}): string {
  const { removeExtension = true, lowercase = true } = options || {};
  
  let base = removeExtension ? name.replace(/\.[^/.]+$/, '') : name;
  
  base = base
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');
  
  if (lowercase) {
    base = base.toLowerCase();
  }
  
  base = base
    .replace(/[^a-zA-Z0-9_.-]/g, '_')
    .replace(/_+/g, '_')
    .replace(/^_+|_+$/g, '');
  
    if (/^\d/.test(base)) {
        base = '_' + base;
    }

    if (!base) {
        base = 'file';
    }

    return base;
}

export function setFileUploadDocumentationURL(fileNames: string[]): string {
  // Format: file://filename1,filename2,filename3 (single file:// prefix)
  const sanitizedNames = fileNames.map(fileName => 
    sanitizeFileName(fileName, { removeExtension: false, lowercase: true })
  );
  return `file://${sanitizedNames.join(',')}`;
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

/**
 * Process a file and extract text content.
 * Handles PDF (with markdown formatting), DOCX, ZIP archives, and plain text files.
 */
export async function processFile(file: File | Blob, fileName: string): Promise<string> {
    const fileType = file.type;
    const lowerFileName = fileName.toLowerCase();

    // Check both MIME type and file extension for PDF detection
    if (fileType === 'application/pdf' || lowerFileName.endsWith('.pdf')) {
        // Extract text from PDF and convert to markdown
        const arrayBuffer = await file.arrayBuffer();
        const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;

        let markdownContent = '';
        const numPages = pdf.numPages;

        for (let pageNum = 1; pageNum <= numPages; pageNum++) {
            const page = await pdf.getPage(pageNum);
            const textContent = await page.getTextContent();

            const viewport = page.getViewport({ scale: 1.0 });
            const pageHeight = viewport.height;

            const textItems = textContent.items as any[];
            const enrichedItems = textItems.map(item => ({
                text: item.str,
                x: Math.round(item.transform[4]),
                y: Math.round(item.transform[5]),
                width: item.width,
                height: item.height,
                fontSize: Math.round(Math.sqrt(item.transform[0] * item.transform[0] + item.transform[1] * item.transform[1])),
                fontName: item.fontName || ''
            }));

            const lines: {
                y: number;
                items: typeof enrichedItems;
                avgFontSize: number;
                isBold: boolean;
                minX: number;
                maxX: number;
            }[] = [];

            enrichedItems.forEach(item => {
                if (!item.text.trim()) return;

                let line = lines.find(l => Math.abs(l.y - item.y) < 3);

                if (!line) {
                    line = {
                        y: item.y,
                        items: [],
                        avgFontSize: 0,
                        isBold: false,
                        minX: item.x,
                        maxX: item.x + item.width
                    };
                    lines.push(line);
                }

                line.items.push(item);
                line.minX = Math.min(line.minX, item.x);
                line.maxX = Math.max(line.maxX, item.x + item.width);
            });

            lines.forEach(line => {
                const totalSize = line.items.reduce((sum, item) => sum + item.fontSize, 0);
                line.avgFontSize = totalSize / line.items.length;
                line.isBold = line.items.some(item =>
                    item.fontName.toLowerCase().includes('bold') ||
                    item.fontName.toLowerCase().includes('heavy')
                );
            });

            lines.sort((a, b) => b.y - a.y);

            const detectTable = (startIdx: number): { rows: string[][], endIdx: number } | null => {
                const potentialRows: typeof lines[0][] = [];
                const columnPositions: number[] = [];

                for (let i = startIdx; i < lines.length; i++) {
                    const line = lines[i];
        if (line.items.length < 2) continue;

                    const sortedItems = [...line.items].sort((a, b) => a.x - b.x);
                    const lineColumns = sortedItems.map(item => item.x);

                    if (columnPositions.length === 0) {
                        columnPositions.push(...lineColumns);
                        potentialRows.push(line);
                    } else {
                        let matches = 0;
                        for (const pos of lineColumns) {
                            if (columnPositions.some(col => Math.abs(col - pos) < 10)) {
                                matches++;
                            }
                        }

                        if (matches >= lineColumns.length * 0.5) {
                            potentialRows.push(line);
                        } else {
            break;
                        }
                    }

        if (i > startIdx && Math.abs(line.y - lines[i-1].y) > 50) {
                        break;
                    }
                }

                if (potentialRows.length >= 2) {
                    const rows = potentialRows.map(line => {
                        const sortedItems = [...line.items].sort((a, b) => a.x - b.x);
                        const cells: string[] = [];

                        let currentCell = '';
                        let lastX = 0;

                        sortedItems.forEach((item, idx) => {
                            if (idx > 0 && item.x - lastX > 20) {
                                cells.push(currentCell.trim());
                                currentCell = item.text;
                            } else {
                                currentCell += (currentCell ? ' ' : '') + item.text;
                            }
                            lastX = item.x + item.width;
                        });

                        if (currentCell) {
                            cells.push(currentCell.trim());
                        }

                        return cells;
                    });

                    return {
                        rows,
                        endIdx: startIdx + potentialRows.length - 1
                    };
                }

                return null;
            };

            const allFontSizes = lines.map(l => l.avgFontSize).filter(s => s > 0);
            const avgPageFontSize = allFontSizes.length > 0
                ? allFontSizes.reduce((a, b) => a + b, 0) / allFontSizes.length
                : 12;

            let pageContent = ``;
            let prevY = null;
            let i = 0;

            while (i < lines.length) {
                const line = lines[i];
                const text = line.items.map(item => item.text).join(' ').trim();

                if (!text) {
                    i++;
                    continue;
                }

                const tableResult = detectTable(i);
                if (tableResult) {
                    const { rows } = tableResult;
                    if (rows.length > 0) {
                        pageContent += '| ' + rows[0].join(' | ') + ' |\n';
                        pageContent += '|' + rows[0].map(() => ' --- ').join('|') + '|\n';

                        for (let j = 1; j < rows.length; j++) {
                            pageContent += '| ' + rows[j].join(' | ') + ' |\n';
                        }
                        pageContent += '\n';
                    }

                    i = tableResult.endIdx + 1;
                    prevY = line.y;
                    continue;
                }

                if (prevY !== null && prevY - line.y > 25) {
                    pageContent += '\n';
                }

                let isHeading = false;
                let headingLevel = 3;

                const sizeRatio = line.avgFontSize / avgPageFontSize;
                if (sizeRatio > 1.5) {
                    isHeading = true;
                    headingLevel = 1;
                } else if (sizeRatio > 1.3) {
                    isHeading = true;
                    headingLevel = 2;
                } else if (sizeRatio > 1.15 || line.isBold) {
                    isHeading = true;
                    headingLevel = 3;
                }

                if (!isHeading && text.length < 80) {
                    if (/^\d+(\.\d+)*\.?\s+[A-Z]/.test(text)) {
                        isHeading = true;
          headingLevel = text.split('.').length + 1;
                    }
                    else if (text === text.toUpperCase() && text.split(' ').length > 1) {
                        isHeading = true;
                        headingLevel = 3;
                    }
                    else if (text.endsWith(':') && text.length < 50) {
                        isHeading = true;
                        headingLevel = 4;
                    }
                }

                if (isHeading) {
                    const prefix = '#'.repeat(Math.min(headingLevel + 2, 6)); // Offset by 2 since page is H2
                    pageContent += `${prefix} ${text}\n\n`;
                } else {
                    pageContent += `${text}\n`;
                }

                prevY = line.y;
                i++;
            }

            markdownContent += pageContent + '\n---\n\n';
        }

        return markdownContent.trim();
    } else if (fileType === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' ||
        lowerFileName.endsWith('.docx')) {
        const arrayBuffer = await file.arrayBuffer();
        const result = await mammoth.extractRawText({ arrayBuffer });
        return result.value;
    } else if (fileType === 'application/zip' ||
        fileType === 'application/x-zip-compressed' ||
        lowerFileName.endsWith('.zip')) {
        const arrayBuffer = await file.arrayBuffer();
        const zip = new (JSZip as any)();
        const loadedZip = await zip.loadAsync(arrayBuffer);

        let combinedText = '';

        const files = Object.entries(loadedZip.files) as [string, any][];
        for (const [zipFileName, zipEntry] of files) {
            if (zipEntry.dir) continue;
            if (zipFileName.startsWith('__MACOSX/') || zipFileName.startsWith('._')) continue;

            try {
                const blob = await zipEntry.async('blob');

                let mimeType = 'text/plain';
                const lowerZipFileName = zipFileName.toLowerCase();
                if (lowerZipFileName.endsWith('.pdf')) {
                    mimeType = 'application/pdf';
                } else if (lowerZipFileName.endsWith('.docx')) {
                    mimeType = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
                } else if (lowerZipFileName.endsWith('.doc')) {
                    mimeType = 'application/msword';
                }

                const typedBlob = new Blob([blob], { type: mimeType });
                const content = await processFile(typedBlob, zipFileName);

                if (content && content.trim()) {
                    combinedText += `\n--- ${zipFileName} ---\n${content}\n`;
                }
            } catch (error) {
                console.warn(`Could not extract text from ${zipFileName}:`, error);
            }
        }

        return combinedText || `ZIP file contains ${Object.keys(loadedZip.files).length} files but no extractable text files were found.`;
    } else {
        return await file.text();
    }
}

export function getFileType(filename: string): 'json' | 'csv' | 'xml' | 'excel' | 'pdf' | 'text' | 'code' | 'archive' | 'other' {
  const ext = filename.toLowerCase().split('.').pop() || '';
  switch (ext) {
    case 'json': return 'json';
    case 'csv': return 'csv';
    case 'xml': return 'xml';
    case 'xlsx':
    case 'xls': return 'excel';
    case 'pdf': return 'pdf';
    case 'txt': return 'text';
    case 'md':
    case 'markdown': return 'code';
    case 'zip': return 'archive';
    default: return 'other';
  }
}

export function truncateFileContent(content: string, maxChars: number): { truncated: string; wasTruncated: boolean } {
  if (content.length <= maxChars) {
    return { truncated: content, wasTruncated: false };
  }

  const headChars = Math.floor(maxChars * 0.7);
  const tailChars = Math.floor(maxChars * 0.3);
  
  const head = content.slice(0, headChars);
  const tail = content.slice(-tailChars);
  
  const originalChars = content.length;
  const omittedChars = originalChars - (headChars + tailChars);
  
  const truncated = `${head}\n\n... [truncated ${omittedChars.toLocaleString()} characters (~${Math.ceil(omittedChars / 5)} tokens) for context window management] ...\n\n${tail}`;
  
  return { truncated, wasTruncated: true };
}
