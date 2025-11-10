export const DEFAULT_MAX_DOWNLOAD_BYTES = 1000 * 1024 * 1024; // 1000 MB

function safeStringify(value: any): string {
  const seen = new WeakSet<object>();
  try {
    return JSON.stringify(
      value,
      (key, val) => {
        if (typeof val === "object" && val !== null) {
          if (seen.has(val)) return "[Circular]";
          seen.add(val);
        }
        return val;
      },
      2,
    );
  } catch (err) {
    // As a last resort, coerce to string
    return String(value ?? "");
  }
}

export function downloadJson(
  data: any,
  filename: string,
  options?: {
    maxBytes?: number;
    onTooLarge?: (bytes: number) => void;
    onError?: (error: Error) => void;
  },
): void {
  try {
    if (data === undefined) {
      throw new Error("No data to download");
    }

    const maxBytes = options?.maxBytes ?? DEFAULT_MAX_DOWNLOAD_BYTES;
    const jsonString = typeof data === "string" ? data : safeStringify(data);

    const byteLength =
      typeof window !== "undefined" && "TextEncoder" in window
        ? new TextEncoder().encode(jsonString).length
        : jsonString.length; // fallback approximation

    if (byteLength > maxBytes) {
      if (options?.onTooLarge) {
        options.onTooLarge(byteLength);
      } else {
        console.warn(
          `downloadJson aborted: payload too large (${byteLength.toLocaleString()} bytes)`,
        );
        if (typeof window !== "undefined") {
          alert(
            "Download aborted: data is too large to download safely in the browser.",
          );
        }
      }
      return;
    }

    const blob = new Blob([jsonString], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = filename;

    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);

    URL.revokeObjectURL(url);
  } catch (error) {
    if (options?.onError && error instanceof Error) {
      options.onError(error);
    } else {
      console.error("downloadJson error", error);
    }
  }
}

export function formatJsonFilename(
  baseFilename: string,
  includeTimestamp: boolean = false,
): string {
  if (includeTimestamp) {
    const timestamp = new Date()
      .toISOString()
      .replace(/[:.]/g, "-")
      .slice(0, -5);
    return `${baseFilename}_${timestamp}.json`;
  }
  return `${baseFilename}.json`;
}
