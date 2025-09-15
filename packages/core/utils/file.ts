import { DecompressionMethod, FileType } from "@superglue/client";
import Papa from 'papaparse';
import sax from 'sax';
import { Readable } from 'stream';
import * as unzipper from 'unzipper';
import { promisify } from 'util';
import * as XLSX from 'xlsx';
import { gunzip, inflate } from 'zlib';
import { parseJSON } from './json-parser.js';



export async function decompressData(compressed: Buffer, method: DecompressionMethod): Promise<Buffer> {
    const gunzipAsync = promisify(gunzip);
    const inflateAsync = promisify(inflate);

    const signature = compressed.slice(0, 4).toString('hex');

    if (method == DecompressionMethod.ZIP || method == DecompressionMethod.AUTO && signature.startsWith('504b')) {
        return await decompressZip(compressed);
    }
    else if (method == DecompressionMethod.GZIP || method == DecompressionMethod.AUTO && signature.startsWith('1f8b')) {
        const buffer = await gunzipAsync(compressed);
        return buffer;
    }
    else if (method == DecompressionMethod.DEFLATE || method == DecompressionMethod.AUTO && signature.startsWith('1f9d')) {
        const buffer = await inflateAsync(compressed);
        return buffer;
    }
    return compressed;
}

export async function decompressZip(buffer: Buffer): Promise<Buffer> {
    try {
        const zipStream = await unzipper.Open.buffer(buffer);
        const isExcel = zipStream.files.some(f =>
            f.path === '[Content_Types].xml' ||
            f.path.startsWith('xl/') ||
            // Add XLSB specific patterns
            f.path.endsWith('.xlsb') ||
            f.path.includes('xl/worksheets/sheet') ||
            f.path.includes('xl/binData/')
        );
        if (isExcel) {
            return buffer;
        }
        const firstFile = zipStream.files?.[0];
        const fileStream = firstFile.stream();
        const chunks: Buffer[] = [];
        for await (const chunk of fileStream) {
            chunks.push(Buffer.from(chunk));
        }
        return Buffer.concat(chunks);
    } catch (error) {
        throw "Error decompressing zip: " + error;
    }
}

export async function parseFile(buffer: Buffer, fileType: FileType): Promise<any> {
    if (!buffer || buffer.length == 0) return null;

    if (fileType === FileType.AUTO) {
        fileType = await detectFileType(buffer);
    }

    switch (fileType) {
        case FileType.JSON:
            return parseJSON(buffer);
        case FileType.XML:
            return parseXML(buffer);
        case FileType.CSV:
            return parseCSV(buffer);
        case FileType.EXCEL:
            return parseExcel(buffer);
        case FileType.RAW:
            return buffer.toString('utf8');
        default:
            throw new Error('Unsupported file type');
    }
}

async function detectCSVHeaders(sample: Buffer, delimiter: string): Promise<{ headerValues: string[], headerRowIndex: number, delimiter: string }> {

    return new Promise<{ headerValues: string[], headerRowIndex: number, delimiter: string }>((resolve, reject) => {
        Papa.parse(Readable.from(sample), {
            preview: 100,
            header: false,
            skipEmptyLines: false,
            delimiter: delimiter,
            complete: (result) => {
                // Find row with most columns
                const headerRowIndex = result.data
                    .reduce<number>((maxIndex: number, row: any[], currentIndex: number, rows: any[][]) =>
                        (row.length > (rows[maxIndex] as any[]).length)
                            ? currentIndex
                            : maxIndex
                        , 0);

                const headerValues = (result.data[headerRowIndex] as string[])
                    .map((value: string, index: number) => value?.trim() || `Column ${index + 1}`);

                resolve({ headerValues, headerRowIndex, delimiter });
            },
            error: (error) => reject(error)
        });
    });
}

async function parseCSV(buffer: Buffer): Promise<any> {
    const results: any[] = [];
    const metadata: any[] = [];

    // First pass: parse first chunk to detect headers
    const sampleSize = Math.min(buffer.length, 32768);
    const sample = buffer.slice(0, sampleSize);
    const delimiter = detectDelimiter(sample);
    const { headerValues, headerRowIndex } = await detectCSVHeaders(sample, delimiter);
    let rawHeader = [];
    // Second pass: parse entire file with detected headers
    let currentLine = -1;
    return new Promise((resolve, reject) => {
        Papa.parse(Readable.from(buffer), {
            header: false,
            skipEmptyLines: false,
            delimiter: delimiter,
            step: (result: { data: any[] }, parser) => {
                try {
                    currentLine++;
                    // Store metadata rows
                    if (currentLine == headerRowIndex) {
                        rawHeader = result.data.filter(Boolean).reduce((acc, value, index) => {
                            acc[`${index}`] = value;
                            return acc;
                        }, {});
                        return;
                    }
                    else if (currentLine < headerRowIndex) {
                        if (result.data == null || result.data?.filter(Boolean).length == 0) return;
                        metadata.push(result?.data);
                        return;
                    }
                    if (result.data == null || result.data.map((value: any) => value?.trim()).filter(Boolean).length == 0) return;
                    const dataObject: { [key: string]: any } = {};
                    for (let i = 0; i < headerValues.length; i++) {
                        dataObject[headerValues[i]] = result.data[i];
                    }
                    results.push(dataObject);
                } catch (error) {
                    parser.abort();
                }
            },
            complete: () => {
                if (metadata.length > 0) {
                    resolve({
                        data: results,
                        metadata
                    });
                }
                else {
                    if (results.length > 0) {
                        resolve(results);
                    }
                    else {
                        resolve(rawHeader);
                    }
                }
            },
            error: (error) => {
                reject(error);
            },
        });
    });
}

export async function parseXML(buffer: Buffer): Promise<any> {
    const results: any = {};
    let currentElement: any = null;
    const elementStack: any[] = [];
    let error: any = null;
    return new Promise((resolve, reject) => {
        const parser = sax.createStream(false);

        parser.on('opentag', (node) => {
            // Create a new object for the current element
            const newElement: any = node.attributes || {};
            // If there's a current element, add this new one as its child
            if (currentElement && typeof currentElement === 'object') {
                elementStack.push(currentElement); // Push current to stack
            }
            else if (currentElement && typeof currentElement === 'string') {
                elementStack.push({ _TEXT: currentElement });
            }
            else {
                elementStack.push({});
            }

            // Update current element
            currentElement = newElement;
        });

        parser.on('text', (text) => {
            if (!currentElement || text?.trim()?.length == 0) {
                return;
            }
            if (typeof currentElement !== 'object' || currentElement === null || Array.isArray(currentElement)) {
                return;
            }

            if (Object.keys(currentElement)?.length > 0) {
                currentElement["_TEXT"] = text.trim();
            }
            else if (Array.isArray(currentElement)) {
                currentElement.push(text.trim());
            }
            else if (typeof currentElement === "string") {
                currentElement = [currentElement, text.trim()];
            }
            else {
                currentElement = text.trim();
            }
        });

        parser.on('closetag', (tagName) => {
            let parentElement = elementStack.pop();
            if (parentElement == null) {
                parentElement = results;
            }
            if (currentElement) {
                if (!parentElement[tagName]) {
                    parentElement[tagName] = currentElement;
                }
                else if (Array.isArray(parentElement[tagName])) {
                    parentElement[tagName].push(currentElement);
                }
                else {
                    // Convert single value to array when second value is encountered
                    parentElement[tagName] = [parentElement[tagName], currentElement];
                }
            }
            currentElement = parentElement;
        });

        parser.on('error', (err) => {
            console.warn('XML parsing warning (continuing):', err.message);
            // Don't reject on errors in non-strict mode, just continue
        });

        parser.on('end', async () => {
            resolve(currentElement);
        });

        const readStream = Readable.from(buffer);
        readStream.pipe(parser); // Pipe the file stream to the SAX parser
    });
}

async function parseExcel(buffer: Buffer): Promise<{ [sheetName: string]: any[] }> {
    try {
        const parsePromise = new Promise<XLSX.WorkBook>((resolve, reject) => {
            try {
                const workbook = XLSX.read(buffer, {
                    type: 'buffer',
                    cellDates: true,
                    dense: false, // Use sparse mode which is sometimes more stable
                    cellStyles: false // Don't parse styles (can cause issues)
                });
                resolve(workbook);
            } catch (error) {
                reject(error);
            }
        });

        // Timeout after 30 seconds
        const timeoutPromise = new Promise<never>((_, reject) => {
            setTimeout(() => reject(new Error('Excel parsing timeout after 60 seconds')), 60000);
        });

        const workbook = await Promise.race([parsePromise, timeoutPromise]);
        const result: { [sheetName: string]: any[] } = {};

        for (const sheetName of workbook.SheetNames) {
            const worksheet = workbook.Sheets[sheetName];

            // Get all rows with original headers
            const rawRows = XLSX.utils.sheet_to_json<any>(worksheet, {
                raw: false,
                header: 1,
                defval: null,  // Use null for empty cells
                blankrows: true // Include blank rows
            });

            if (!rawRows?.length) {
                result[sheetName] = [];
                continue;
            }

            // Find the first non-empty row to use as headers
            // A row is considered "empty" if it has fewer than 2 non-null values
            let headerRowIndex = 0;
            for (let i = 0; i < Math.min(rawRows.length, 10); i++) {
                const row = rawRows[i] || [];
                const nonNullCount = row.filter((v: any) => v !== null && v !== undefined && v !== '').length;
                if (nonNullCount >= 2) {
                    headerRowIndex = i;
                    break;
                }
            }

            // Get headers from the first non-empty row
            const headers = rawRows[headerRowIndex].map((header: any, index: number) =>
                header ? String(header).trim() : `Column ${index + 1}`
            );

            // Process all rows after the header row
            const processedRows = rawRows.slice(headerRowIndex + 1).map((row: any) => {
                const obj: { [key: string]: any } = {};
                headers.forEach((header: string, index: number) => {
                    if (header && row[index] !== undefined) {
                        obj[header] = row[index];
                    }
                });
                return obj;
            });

            result[sheetName] = processedRows;
        }

        return result;
    } catch (error) {
        console.error('Failed parsing Excel file:', error);
        throw error;
    }
}

async function detectFileType(buffer: Buffer): Promise<FileType> {
    const xlsxSignature = buffer.slice(0, 4).toString('hex');
    if (xlsxSignature === '504b0304') { // XLSX files are ZIP files
        try {
            const zipStream = await unzipper.Open.buffer(buffer);
            const hasExcelSignature = zipStream.files.some(f =>
                f.path === '[Content_Types].xml' ||
                f.path === 'xl/workbook.xml' ||
                f.path.startsWith('xl/worksheets/')
            );
            if (hasExcelSignature) {
                return FileType.EXCEL;
            }
        } catch (error) { 
            console.error('Failed to detect Excel file:', error);
        }
    }
    const sampleSize = Math.min(buffer.length, 4096);
    const sample = buffer.slice(0, sampleSize).toString('utf8');

    try {
        const trimmedLine = sample.trim();

        if (trimmedLine.startsWith('{') || trimmedLine.startsWith('[')) {
            return FileType.JSON;
        } else if (trimmedLine.startsWith('<?xml') || trimmedLine.startsWith('<')) {
            return FileType.XML;
        } else if (isLikelyCSV(buffer)) {
            return FileType.CSV;
        } else {
            return FileType.RAW;
        }
    } catch (error) {
        throw new Error(`Error reading file: ${error.message}`);
    }
}

function isLikelyCSV(buffer: Buffer): boolean {
    // Take a sample of the file
    const sampleSize = Math.min(buffer.length, 8192);
    const sample = buffer.slice(0, sampleSize).toString('utf8');
    const lines = sample.split(/\r?\n/).filter(line => line.length > 0).slice(0, 10);

    if (lines.length < 2) return false;

    // Check common delimiters
    const delimiters = [',', '\t', ';', '|'];

    for (const delimiter of delimiters) {
        // Count delimiter occurrences in each line
        const delimiterCounts = lines.map(line => {
            return (line.match(new RegExp(`\\${delimiter}`, 'g')) || []).length;
        });

        // Skip if no delimiters found
        if (Math.max(...delimiterCounts) === 0) continue;

        // Check if delimiter count is consistent across lines
        // Allow some variance for headers and empty fields
        const nonZeroCounts = delimiterCounts.filter(count => count > 0);
        if (nonZeroCounts.length >= lines.length * 0.7) { // At least 70% of lines have delimiters
            const avgCount = nonZeroCounts.reduce((a, b) => a + b, 0) / nonZeroCounts.length;
            const consistentLines = delimiterCounts.filter(count =>
                count === 0 || Math.abs(count - avgCount) <= Math.max(2, avgCount * 0.3)
            ).length;

            // If most lines have consistent delimiter counts, it's likely CSV
            if (consistentLines >= lines.length * 0.8) {
                return true;
            }
        }
    }

    return false;
}

function detectDelimiter(buffer: Buffer): string {
    const sampleSize = Math.min(buffer.length, 32768);
    const sample = buffer.slice(0, sampleSize).toString('utf8');
    const delimiters = [',', '|', '\t', ';', ':'];
    const counts = delimiters.map(delimiter => ({
        delimiter,
        count: countUnescapedDelimiter(sample, delimiter)
    }));

    const detectedDelimiter = counts.reduce((prev, curr) => {
        return curr.count > prev.count ? curr : prev;
    });

    if (detectedDelimiter.count === 0) {
        return ',';
    }

    return detectedDelimiter.delimiter;
}

function countUnescapedDelimiter(text: string, delimiter: string): number {
    let count = 0;
    let inQuotes = false;
    let prevChar = '';
    let delimiterLength = delimiter.length;
    for (let i = 0; i < text.length; i++) {
        const currentChar = text[i];
        const searchChar = text.substring(i, i + delimiterLength);
        // Toggle quote state, but only if the quote isn't escaped
        if (currentChar === '"' && prevChar !== '\\') {
            inQuotes = !inQuotes;
        }
        // Count delimiter only if we're not inside quotes
        else if (searchChar === delimiter && !inQuotes) {
            count++;
        }

        prevChar = currentChar;
    }

    return count;
}

function splitRespectingQuotes(text: string): string[] {
    const rows: string[] = [];
    let currentRow = '';
    let inQuotes = false;
    let prevChar = '';

    for (let i = 0; i < text.length; i++) {
        const char = text[i];

        // Handle quotes
        if (char === '"' && prevChar !== '\\') {
            inQuotes = !inQuotes;
        }

        // Handle newlines
        if (char === '\n' && !inQuotes) {
            rows.push(currentRow);
            currentRow = '';
        } else {
            currentRow += char;
        }

        prevChar = char;
    }

    // Don't forget the last row
    if (currentRow) {
        rows.push(currentRow);
    }

    return rows;
}