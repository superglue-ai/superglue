import { SupportedFileType } from '@superglue/shared';
import yaml from 'js-yaml';
import { DetectionPriority, FileParsingStrategy } from '../strategy.js';

export class YAMLStrategy implements FileParsingStrategy {
    readonly fileType = SupportedFileType.YAML;
    readonly priority = DetectionPriority.STRUCTURED_TEXT;

    canHandle(buffer: Buffer): boolean {
        const sampleSize = Math.min(buffer.length, 4096);
        const sample = buffer.subarray(0, sampleSize).toString('utf8').trim();

        // YAML document start or directive
        if (sample.startsWith('---') || sample.startsWith('%YAML')) return true;

        // Not JSON (JSON takes precedence for objects/arrays)
        if (sample.startsWith('{') || sample.startsWith('[')) return false;

        // Check for key: value pattern
        return /^[\w-]+:\s*.+/m.test(sample);
    }

    async parse(buffer: Buffer): Promise<any> {
        return parseYAML(buffer);
    }
}

export function parseYAML(buffer: Buffer | string): any {
    const content = typeof buffer === 'string' ? buffer : buffer.toString('utf8');
    return yaml.load(content);
}

