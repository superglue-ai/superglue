import { SupportedFileType } from '@superglue/shared';
import JSZip from 'jszip';
import { DetectionPriority, FileParsingStrategy } from '../strategy.js';

export class ZIPStrategy implements FileParsingStrategy {
    readonly fileType = SupportedFileType.ZIP;
    readonly priority = DetectionPriority.BINARY_SIGNATURE;

    canHandle(buffer: Buffer): boolean {
        if (buffer.length < 4) return false;
        const signature = buffer.subarray(0, 4).toString('hex');
        return signature === '504b0304';
    }

    async parse(buffer: Buffer): Promise<any> {
        return parseZIP(buffer);
    }
}

export async function parseZIP(buffer: Buffer): Promise<Record<string, Buffer>> {
    const zip = new JSZip();
    const loadedZip = await zip.loadAsync(buffer);
    const extracted: Record<string, Buffer> = {};

    for (const [filename, file] of Object.entries(loadedZip.files)) {
        if (file.dir) continue;
        if (filename.startsWith('__MACOSX/') || filename.startsWith('._')) continue;

        const content = await file.async('nodebuffer') as Buffer;
        extracted[filename] = content;
    }

    return extracted;
}

