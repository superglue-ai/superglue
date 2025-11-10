import { SupportedFileType } from '@superglue/shared';
import { PDFParse } from 'pdf-parse';
import { logMessage } from '../../utils/logs.js';
import { DetectionPriority, FileParsingStrategy } from '../strategy.js';

export class PDFStrategy implements FileParsingStrategy {
    readonly fileType = SupportedFileType.PDF;
    readonly priority = DetectionPriority.BINARY_SIGNATURE;

    canHandle(buffer: Buffer): boolean {
        // PDF files start with %PDF signature (hex: 25504446)
        if (buffer.length < 4) return false;
        const signature = buffer.subarray(0, 4).toString('hex');
        return signature === '25504446';
    }

    async parse(buffer: Buffer): Promise<any> {
        return parsePDF(buffer);
    }
}

export async function parsePDF(buffer: Buffer): Promise<{ textContent: string; structuredContent: any }> {
    const parser = new PDFParse({
        data: buffer,
        isEvalSupported: false,
        useSystemFonts: true,
    });

    const textResult = await parser.getText(PDF_TEXT_CONFIG).catch((err) => {
        logMessage('warn', `PDF text extraction failed: ${err.message}`, {});
        return { text: '' };
    });

    let tableResult = { pages: [] };
    try {
        tableResult = await parser.getTable();
    } catch (err) {
        logMessage('debug', `PDF table extraction not available in Node.js environment: ${err.message}`, {});
    }

    await parser.destroy();

    return {
        textContent: textResult.text || '',
        structuredContent: tableResult.pages || []
    };
}

const PDF_TEXT_CONFIG = {
    parseHyperlinks: true,
    lineEnforce: true,
    pageJoiner: '\n\n---\n\n',
    cellSeparator: '\t',
    cellThreshold: 7,
    lineThreshold: 4.6
};