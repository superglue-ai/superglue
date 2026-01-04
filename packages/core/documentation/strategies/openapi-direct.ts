import { ServiceMetadata } from "@superglue/shared";
import * as yaml from "js-yaml";

import { logMessage } from "../../utils/logs.js";
import { isValidOpenApiSpec } from "../documentation-utils.js";
import { OpenApiFetchingStrategy } from "../types.js";

export class DirectOpenApiStrategy implements OpenApiFetchingStrategy {
  async tryFetch(
    responseData: any,
    openApiUrl: string,
    metadata: ServiceMetadata,
  ): Promise<string | null> {
    try {
      let parsedData: any = null;

      if (typeof responseData === "object" && responseData !== null) {
        parsedData = responseData;
      } else if (typeof responseData === "string") {
        const trimmedData = responseData.trim();

        try {
          parsedData = JSON.parse(trimmedData);
          // if parsedData is empty, throw an error to try yaml instead
          if (
            !parsedData ||
            parsedData === null ||
            parsedData === undefined ||
            typeof parsedData !== "object" ||
            (Array.isArray(parsedData) && parsedData.length === 0) ||
            (!Array.isArray(parsedData) && Object.keys(parsedData).length === 0)
          ) {
            throw new Error("Parsed data is empty");
          }
        } catch {
          try {
            parsedData = yaml.load(trimmedData) as any;
          } catch (yamlError) {
            logMessage(
              "debug",
              `DirectOpenApiStrategy: Failed to parse content as JSON or YAML from ${openApiUrl}`,
              metadata,
            );
            return null;
          }
        }
      } else {
        return null;
      }

      if (!isValidOpenApiSpec(parsedData)) {
        logMessage(
          "debug",
          `DirectOpenApiStrategy: Parsed data is not a valid OpenAPI spec for ${openApiUrl}`,
          metadata,
        );
        return null;
      }

      logMessage("info", `Successfully found valid OpenAPI spec at ${openApiUrl}`, metadata);
      return JSON.stringify(parsedData, null, 2);
    } catch (error) {
      logMessage(
        "warn",
        `DirectOpenApiStrategy: Unexpected error processing ${openApiUrl}: ${error?.message}`,
        metadata,
      );
      return null;
    }
  }
}
