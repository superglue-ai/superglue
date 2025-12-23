import { SupportedFileType } from '@superglue/shared';
import { CSVStrategy, parseCSV } from './parsers/csv.js';
import { DOCXStrategy, parseDOCX } from './parsers/docx.js';
import { ExcelStrategy, parseExcel } from './parsers/excel.js';
import { GZIPStrategy, parseGZIP, setGzipParseFileFunction } from './parsers/gzip.js';
import { JSONStrategy, parseJSON } from './parsers/json.js';
import { PDFStrategy, parsePDF } from './parsers/pdf.js';
import { XMLStrategy, parseXML } from './parsers/xml.js';
import { YAMLStrategy, parseYAML } from './parsers/yaml.js';
import { setZipParseFileFunction, ZIPStrategy, parseZIP } from './parsers/zip.js';
import { FileStrategyRegistry } from './strategy.js';

const fileStrategyRegistry = new FileStrategyRegistry();

fileStrategyRegistry.register(new GZIPStrategy());        // Priority 1: GZIP
fileStrategyRegistry.register(new ExcelStrategy());       // Priority 2: ZIP_BASED_SPECIFIC
fileStrategyRegistry.register(new DOCXStrategy());        // Priority 2: ZIP_BASED_SPECIFIC
fileStrategyRegistry.register(new PDFStrategy());         // Priority 10: BINARY_SIGNATURE
fileStrategyRegistry.register(new ZIPStrategy());         // Priority 11: ZIP_GENERIC
fileStrategyRegistry.register(new JSONStrategy());        // Priority 20: STRUCTURED_TEXT
fileStrategyRegistry.register(new XMLStrategy());         // Priority 20: STRUCTURED_TEXT
fileStrategyRegistry.register(new YAMLStrategy());        // Priority 20: STRUCTURED_TEXT
fileStrategyRegistry.register(new CSVStrategy());         // Priority 30: HEURISTIC_TEXT

export async function parseFile(buffer: Buffer, fileType: SupportedFileType = SupportedFileType.AUTO): Promise<any> {
    if (!buffer || buffer.length === 0) return null;

    switch (fileType) {
        case SupportedFileType.JSON:
            return parseJSON(buffer);
        case SupportedFileType.CSV:
            return parseCSV(buffer);
        case SupportedFileType.XML:
            return parseXML(buffer);
        case SupportedFileType.YAML:
            return parseYAML(buffer);
        case SupportedFileType.EXCEL:
            return parseExcel(buffer);
        case SupportedFileType.PDF:
            return parsePDF(buffer);
        case SupportedFileType.DOCX:
            return parseDOCX(buffer);
        case SupportedFileType.GZIP:
            return parseGZIP(buffer);
        case SupportedFileType.ZIP:
            return parseZIP(buffer);
        case SupportedFileType.RAW:
            return buffer.toString('utf8');
        case SupportedFileType.AUTO:
            return (await fileStrategyRegistry.detectAndParse(buffer)).data;
        default:
            throw new Error(`Unsupported file type: ${fileType}`);
    }
}

// Inject parseFile function into GZIP and ZIP parsers to avoid circular imports
setGzipParseFileFunction(parseFile);
setZipParseFileFunction(parseFile);

export * from './parsers/csv.js';
export * from './parsers/docx.js';
export * from './parsers/excel.js';
export * from './parsers/gzip.js';
export * from './parsers/json.js';
export * from './parsers/pdf.js';
export * from './parsers/xml.js';
export * from './parsers/yaml.js';
export * from './parsers/zip.js';
export * from './strategy.js';

