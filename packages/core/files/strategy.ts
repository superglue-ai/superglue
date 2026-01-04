import { SupportedFileType } from "@superglue/shared";

export enum DetectionPriority {
  /** GZIP - Must be tested first to decompress before other formats */
  GZIP = 1,

  /** ZIP-based formats with specific internal structure (Excel, DOCX) - tested before generic ZIP */
  ZIP_BASED_SPECIFIC = 2,

  /** Binary formats with simple magic number signatures (PDF) */
  BINARY_SIGNATURE = 10,

  /** Generic ZIP - tested after specific ZIP-based formats (Excel, DOCX) */
  ZIP_GENERIC = 11,

  /** Text formats with clear structure (JSON, XML) */
  STRUCTURED_TEXT = 20,

  /** Text formats with heuristic detection (CSV) */
  HEURISTIC_TEXT = 30,

  /** Fallback to raw string */
  FALLBACK = 99,
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
      data: buffer.toString("utf8"),
    };
  }
}
