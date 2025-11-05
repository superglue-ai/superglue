import { decompressData } from './decompressor.js';
import { detectFileType } from './detector.js';
import { parseCSV } from './parsers/csv.js';
import { parseDOCX } from './parsers/docx.js';
import { parseExcel } from './parsers/excel.js';
import { parseJSON } from './parsers/json.js';
import { parsePDF } from './parsers/pdf.js';
import { parseXML } from './parsers/xml.js';
import { parseZIP } from './parsers/zip.js';

export async function parseFile(buffer: Buffer, fileType: string = 'AUTO'): Promise<any> {
    if (!buffer || buffer.length === 0) return null;

    if (fileType === 'AUTO') {
        fileType = await detectFileType(buffer);
    }

    switch (fileType) {
        case 'JSON':
            return parseJSON(buffer);
        case 'CSV':
            return parseCSV(buffer);
        case 'XML':
            return parseXML(buffer);
        case 'EXCEL':
            return parseExcel(buffer);
        case 'PDF':
            return parsePDF(buffer);
        case 'DOCX':
            return parseDOCX(buffer);
        case 'ZIP': {
            const extractedFiles = await parseZIP(buffer);
            const processed: Record<string, any> = {};
            for (const [filename, content] of Object.entries(extractedFiles)) {
                processed[filename] = await parseFile(content, 'AUTO');
            }
            return processed;
        }
        case 'RAW':
            return buffer.toString('utf8');
        default:
            throw new Error(`Unsupported file type: ${fileType}`);
    }
}

export * from './parsers/csv.js';
export * from './parsers/docx.js';
export * from './parsers/excel.js';
export * from './parsers/json.js';
export * from './parsers/pdf.js';
export * from './parsers/xml.js';
export * from './parsers/zip.js';
export { decompressData, detectFileType };

