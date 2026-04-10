import axios from "axios";
import * as yaml from "js-yaml";
import { ServiceMetadata } from "@superglue/shared";
import { logMessage } from "../../utils/logs.js";
import { OpenApiFetchingStrategy } from "../types.js";
import { isValidOpenApiSpec } from "../documentation-utils.js";
import { server_defaults } from "../../default.js";

/**
 * Strategy for extracting OpenAPI specs from SwaggerHub and similar hosted platforms.
 *
 * SwaggerHub pattern:
 * - UI URL: https://app.swaggerhub.com/apis/OWNER/API_NAME/VERSION
 * - API URL: https://api.swaggerhub.com/apis/OWNER/API_NAME/VERSION
 *
 * The UI pages are heavy SPAs that timeout, but the API endpoint returns raw JSON/YAML.
 */
export class SwaggerHubStrategy implements OpenApiFetchingStrategy {
  private static readonly SWAGGERHUB_PATTERNS = [
    {
      // app.swaggerhub.com/apis/OWNER/NAME/VERSION -> api.swaggerhub.com/apis/OWNER/NAME/VERSION
      match: /^https?:\/\/app\.swaggerhub\.com\/(apis(?:-docs)?)\//i,
      transform: (url: string) =>
        url.replace(/app\.swaggerhub\.com\/(apis(?:-docs)?)\//, "api.swaggerhub.com/apis/"),
    },
    {
      // app.swaggerhub.com/apis-docs/OWNER/NAME/VERSION -> api.swaggerhub.com/apis/OWNER/NAME/VERSION
      match: /^https?:\/\/app\.swaggerhub\.com\/apis-docs\//i,
      transform: (url: string) =>
        url.replace("app.swaggerhub.com/apis-docs/", "api.swaggerhub.com/apis/"),
    },
  ];

  async tryFetch(data: any, sourceUrl: string, metadata: ServiceMetadata): Promise<string | null> {
    // Check if this is a SwaggerHub URL
    const matchingPattern = SwaggerHubStrategy.SWAGGERHUB_PATTERNS.find((p) =>
      p.match.test(sourceUrl),
    );

    if (!matchingPattern) {
      return null;
    }

    // Transform to API URL
    let apiUrl = matchingPattern.transform(sourceUrl);

    // Remove query params and hash
    try {
      const urlObj = new URL(apiUrl);
      urlObj.search = "";
      urlObj.hash = "";
      apiUrl = urlObj.toString();
    } catch {
      // Keep as-is if URL parsing fails
    }

    logMessage(
      "info",
      `SwaggerHubStrategy: Detected SwaggerHub URL, trying API endpoint: ${apiUrl}`,
      metadata,
    );

    try {
      const response = await axios.get(apiUrl, {
        timeout: server_defaults.DOCUMENTATION.TIMEOUTS.AXIOS,
        headers: {
          Accept: "application/json, application/yaml, */*",
        },
      });

      let specData = response.data;

      // Parse if string (could be JSON or YAML)
      if (typeof specData === "string") {
        try {
          specData = JSON.parse(specData);
        } catch {
          try {
            specData = yaml.load(specData) as any;
          } catch (yamlError) {
            logMessage(
              "debug",
              `SwaggerHubStrategy: Response is neither valid JSON nor YAML: ${yamlError?.message}`,
              metadata,
            );
          }
        }
      }

      // Validate it's a real OpenAPI spec
      if (isValidOpenApiSpec(specData)) {
        logMessage(
          "info",
          `SwaggerHubStrategy: Successfully fetched valid OpenAPI spec from ${apiUrl}`,
          metadata,
        );
        return typeof specData === "string" ? specData : JSON.stringify(specData, null, 2);
      }

      logMessage(
        "warn",
        `SwaggerHubStrategy: Fetched data from ${apiUrl} is not a valid OpenAPI spec`,
        metadata,
      );
      return null;
    } catch (error) {
      logMessage(
        "warn",
        `SwaggerHubStrategy: Failed to fetch from ${apiUrl}: ${error?.message}`,
        metadata,
      );
      return null;
    }
  }
}
