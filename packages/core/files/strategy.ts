import { SupportedFileType } from '@superglue/shared';

export enum DetectionPriority {
    /** Binary formats with magic numbers (PDF, Excel, DOCX, ZIP) - tested first (with priority within formats unimportant) */
    BINARY_SIGNATURE = 1,
    /** Text formats with clear structure (JSON, XML) - tested second */
    STRUCTURED_TEXT = 2,
    /** Text formats with heuristic detection (CSV) - tested third */
    HEURISTIC_TEXT = 3,
    /** Fallback to raw string */
    FALLBACK = 99
}

export interface FileParsingStrategy {
    /**
     * The file type this strategy handles
     */
    readonly fileType: SupportedFileType;

    /**
     * Priority for detection - determines the order strategies are tested
     */
    readonly priority: DetectionPriority;

    /**
     * Detect if this strategy can handle the given buffer
     * @param buffer The file buffer to test
     * @returns true if this strategy can handle the buffer
     */
    canHandle(buffer: Buffer): Promise<boolean> | boolean;

    /**
     * Parse the buffer using this strategy
     * @param buffer The file buffer to parse
     * @returns The parsed data
     */
    parse(buffer: Buffer): Promise<any>;
}

/**
 * Registry for file parsing strategies
 */
export class FileStrategyRegistry {
    private strategies: FileParsingStrategy[] = [];

    register(strategy: FileParsingStrategy): void {
        this.strategies.push(strategy);
        // Sort by priority (lower number = higher priority)
        this.strategies.sort((a, b) => a.priority - b.priority);
    }

    getStrategies(): FileParsingStrategy[] {
        return [...this.strategies];
    }

    async detectAndParse(buffer: Buffer): Promise<{ fileType: SupportedFileType; data: any }> {
        if (!buffer || buffer.length === 0) {
            return { fileType: SupportedFileType.RAW, data: null };
        }

        for (const strategy of this.strategies) {
            try {
                const canHandle = await strategy.canHandle(buffer);
                if (canHandle) {
                    const data = await strategy.parse(buffer);
                    return { fileType: strategy.fileType, data };
                }
            } catch (error) {
                console.warn(`Strategy ${strategy.fileType} failed:`, error);
            }
        }

        return {
            fileType: SupportedFileType.RAW,
            data: buffer.toString('utf8')
        };
    }
}
