import { SupportedFileType } from '@superglue/shared';

/**
 * Detection priority levels for file parsing strategies
 * Strategies are tested from lowest to highest priority number
 */
export enum DetectionPriority {
    /** Binary formats with magic numbers (PDF, Excel, DOCX, ZIP) - tested FIRST */
    BINARY_SIGNATURE = 1,
    /** Text formats with clear structure (JSON, XML) - tested SECOND */
    STRUCTURED_TEXT = 2,
    /** Text formats with heuristic detection (CSV) - tested THIRD */
    HEURISTIC_TEXT = 3,
    /** Fallback to raw string - tested LAST */
    FALLBACK = 99
}

/**
 * Base interface for file detection and parsing strategies.
 */
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

    /**
     * Register a new parsing strategy
     */
    register(strategy: FileParsingStrategy): void {
        this.strategies.push(strategy);
        // Sort by priority (lower number = higher priority)
        this.strategies.sort((a, b) => a.priority - b.priority);
    }

    /**
     * Get all registered strategies in priority order
     */
    getStrategies(): FileParsingStrategy[] {
        return [...this.strategies];
    }

    /**
     * Detect and parse a buffer using the first matching strategy
     * @param buffer The file buffer to detect and parse
     * @returns Object containing the detected file type and parsed data
     */
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
