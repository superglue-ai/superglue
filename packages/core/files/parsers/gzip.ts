import { SupportedFileType } from '@superglue/shared';
import { promisify } from 'util';
import { gunzip } from 'zlib';
import { DetectionPriority, FileParsingStrategy } from '../strategy.js';

const gunzipAsync = promisify(gunzip);

export class GZIPStrategy implements FileParsingStrategy {
    readonly fileType = SupportedFileType.RAW; // GZIP is a container, not a final type
    readonly priority = DetectionPriority.BINARY_SIGNATURE;

    canHandle(buffer: Buffer): boolean {
        // GZIP files start with 1f8b signature
        if (buffer.length < 2) return false;
        const signature = buffer.subarray(0, 2).toString('hex');
        return signature === '1f8b';
    }

    async parse(buffer: Buffer): Promise<any> {
        return gunzipAsync(buffer);
    }
}
