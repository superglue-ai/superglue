import { SupportedFileType } from '@superglue/shared';
import JSZip from 'jszip';
import { DetectionPriority, FileParsingStrategy } from '../strategy.js';

type ParseFileFunction = (buffer: Buffer, fileType: SupportedFileType) => Promise<any>;

// Store parseFile function to avoid circular import (set by index.ts)
let parseFileFunction: ParseFileFunction | null = null;

export function setZipParseFileFunction(fn: ParseFileFunction): void {
    parseFileFunction = fn;
}

export class ZIPStrategy implements FileParsingStrategy {
    readonly fileType = SupportedFileType.ZIP;
    readonly priority = DetectionPriority.ZIP_GENERIC;

    canHandle(buffer: Buffer): boolean {
        if (buffer.length < 4) return false;
        const signature = buffer.subarray(0, 4).toString('hex');
        return signature === '504b0304';
    }

    async parse(buffer: Buffer): Promise<any> {
        return parseZIP(buffer);
    }
}


export async function parseZIP(buffer: Buffer): Promise<Record<string, any>> {
    const zip = new JSZip();
    const loadedZip = await zip.loadAsync(buffer);
    const extracted: Record<string, any> = {};

    for (const [filename, file] of Object.entries(loadedZip.files)) {
        if (file.dir) continue;
        if (filename.startsWith('__MACOSX/') || filename.startsWith('._')) continue;

        const content = await file.async('nodebuffer') as Buffer;

        // Recursively parse each extracted file using the injected parseFile function
        if (parseFileFunction) {
            extracted[filename] = await parseFileFunction(content, SupportedFileType.AUTO);
        } else {
            // Fallback: return raw buffer if parseFile function not set
            extracted[filename] = content;
        }
    }

    return extracted;
}

