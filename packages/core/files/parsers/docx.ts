import { SupportedFileType } from '@superglue/shared';
import * as mammoth from 'mammoth';
import * as unzipper from 'unzipper';
import { DetectionPriority, FileParsingStrategy } from '../strategy.js';


export class DOCXStrategy implements FileParsingStrategy {
    readonly fileType = SupportedFileType.DOCX;
    readonly priority = DetectionPriority.BINARY_SIGNATURE;

    async canHandle(buffer: Buffer): Promise<boolean> {
        // Must be a ZIP file first (PK signature)
        if (buffer.length < 4) return false;
        const signature = buffer.subarray(0, 4).toString('hex');
        if (signature !== '504b0304') return false;

        // Check for Word-specific files inside the ZIP
        try {
            const zipStream = await unzipper.Open.buffer(buffer);
            const hasWordSignature = zipStream.files.some(f =>
                f.path === 'word/document.xml' ||
                f.path.startsWith('word/')
            );
            return hasWordSignature;
        } catch (error) {
            return false;
        }
    }

    async parse(buffer: Buffer): Promise<any> {
        return parseDOCX(buffer);
    }
}

export async function parseDOCX(buffer: Buffer): Promise<string> {
    const result = await mammoth.extractRawText({ buffer });
    return result.value;
}

