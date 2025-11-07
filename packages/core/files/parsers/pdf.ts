import { PDFParse } from 'pdf-parse';
import { logMessage } from '../../utils/logs.js';

const PDF_TEXT_CONFIG = {
    parseHyperlinks: true,
    lineEnforce: true,
    pageJoiner: '\n\n---\n\n',
    cellSeparator: '\t',
    cellThreshold: 7,
    lineThreshold: 4.6
};

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
        structuredContent: {
            tables: tableResult.pages || []
        }
    };
}

