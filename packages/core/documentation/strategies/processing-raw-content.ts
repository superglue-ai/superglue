/**
 * Raw Content Strategy
 * 
 * Returns raw content as final fallback when no other processor can handle it.
 */

import { ApiConfig } from "@superglue/shared";
import { Metadata } from "@superglue/shared";
import { logMessage } from "../../utils/logs.js";
import { DocumentationProcessingStrategy } from '../types.js';

export class RawPageContentStrategy implements DocumentationProcessingStrategy {
  async tryProcess(content: string, config: ApiConfig, metadata: Metadata): Promise<string | null> {
    if (content) {
      logMessage('info', "Storing raw fetched content as final documentation.", metadata);
      if (typeof content !== 'string') {
        content = JSON.stringify(content, null, 2);
      }
      return content;
    }
    return null;
  }
}

