import { SupportedFileType } from '@superglue/shared';
import { CSVStrategy, parseCSV } from './parsers/csv.js';
import { DOCXStrategy, parseDOCX } from './parsers/docx.js';
import { ExcelStrategy, parseExcel } from './parsers/excel.js';
import { GZIPStrategy } from './parsers/gzip.js';
import { JSONStrategy, parseJSON } from './parsers/json.js';
import { PDFStrategy, parsePDF } from './parsers/pdf.js';
import { XMLStrategy, parseXML } from './parsers/xml.js';
import { ZIPStrategy, parseZIP } from './parsers/zip.js';
import { FileStrategyRegistry } from './strategy.js';

const fileStrategyRegistry = new FileStrategyRegistry();

// Register all strategies (registry auto-sorts by priority)
fileStrategyRegistry.register(new GZIPStrategy());
fileStrategyRegistry.register(new PDFStrategy());
fileStrategyRegistry.register(new ExcelStrategy());
fileStrategyRegistry.register(new DOCXStrategy());
fileStrategyRegistry.register(new ZIPStrategy());
fileStrategyRegistry.register(new JSONStrategy());
fileStrategyRegistry.register(new XMLStrategy());
fileStrategyRegistry.register(new CSVStrategy());

export async function parseFile(buffer: Buffer, fileType: SupportedFileType = SupportedFileType.AUTO): Promise<any> {
    if (!buffer || buffer.length === 0) return null;

    // If fileType is AUTO, use strategy pattern for detection
    if (fileType === SupportedFileType.AUTO) {
        const result = await fileStrategyRegistry.detectAndParse(buffer);

        if (result.fileType === SupportedFileType.ZIP) {
            const extractedFiles = result.data as Record<string, Buffer>;
            const processed: Record<string, any> = {};
            for (const [filename, content] of Object.entries(extractedFiles)) {
                processed[filename] = await parseFile(content, SupportedFileType.AUTO);
            }
            return processed;
        } else if (result.data instanceof Buffer) {
            // GZIP or other decompressed data - recursively parse the decompressed content
            return parseFile(result.data, SupportedFileType.AUTO);
        }

        return result.data;
    }

    switch (fileType) {
        case SupportedFileType.JSON:
            return parseJSON(buffer);
        case SupportedFileType.CSV:
            return parseCSV(buffer);
        case SupportedFileType.XML:
            return parseXML(buffer);
        case SupportedFileType.EXCEL:
            return parseExcel(buffer);
        case SupportedFileType.PDF:
            return parsePDF(buffer);
        case SupportedFileType.DOCX:
            return parseDOCX(buffer);
        case SupportedFileType.ZIP: {
            const extractedFiles = await parseZIP(buffer);
            const processed: Record<string, any> = {};
            for (const [filename, content] of Object.entries(extractedFiles)) {
                processed[filename] = await parseFile(content, SupportedFileType.AUTO);
            }
            return processed;
        }
        case SupportedFileType.RAW:
            return buffer.toString('utf8');
        default:
            throw new Error(`Unsupported file type: ${fileType}`);
    }
}

export * from './parsers/csv.js';
export * from './parsers/docx.js';
export * from './parsers/excel.js';
export * from './parsers/gzip.js';
export * from './parsers/json.js';
export * from './parsers/pdf.js';
export * from './parsers/xml.js';
export * from './parsers/zip.js';
export * from './strategy.js';

