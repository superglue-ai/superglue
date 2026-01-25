import { ALLOWED_FILE_EXTENSIONS } from "@superglue/shared";

export const MAX_TOTAL_FILE_SIZE_CHAT = 10 * 1024 * 1024;
export const MAX_TOTAL_FILE_SIZE_TOOLS = 1000 * 1024 * 1024;
export const MAX_TOTAL_FILE_SIZE_DOCUMENTATION = 50 * 1024 * 1024;

export interface UploadedFileInfo {
  name: string;
  size?: number; // Optional for cases where size is unknown (e.g., from file:// URLs)
  key: string;
  status?: "processing" | "ready" | "error"; // Optional, defaults to 'ready'
  error?: string;
}

export function isAllowedFileType(filename: string): boolean {
  const ext = filename.toLowerCase().split(".").pop();
  return ALLOWED_FILE_EXTENSIONS.includes(`.${ext}` as any);
}

export async function processAndExtractFile(file: File, client: any): Promise<any> {
  const extractResult = await client.extract({ file });
  if (!extractResult.success) {
    throw new Error(extractResult.error || "Failed to extract data");
  }
  return extractResult.data;
}

export function sanitizeFileName(
  name: string,
  options?: {
    removeExtension?: boolean;
    lowercase?: boolean;
  },
): string {
  const { removeExtension = true, lowercase = true } = options || {};

  let base = removeExtension ? name.replace(/\.[^/.]+$/, "") : name;

  base = base.normalize("NFD").replace(/[\u0300-\u036f]/g, "");

  if (lowercase) {
    base = base.toLowerCase();
  }

  base = base
    .replace(/[^a-zA-Z0-9_.-]/g, "_")
    .replace(/_+/g, "_")
    .replace(/^_+|_+$/g, "");

  if (/^\d/.test(base)) {
    base = "_" + base;
  }

  if (!base) {
    base = "file";
  }

  return base;
}

export function setFileUploadDocumentationURL(fileNames: string[]): string {
  // Format: file://filename1,filename2,filename3 (single file:// prefix)
  const sanitizedNames = fileNames.map((fileName) =>
    sanitizeFileName(fileName, { removeExtension: false, lowercase: false }),
  );
  return `file://${sanitizedNames.join(",")}`;
}

export function generateUniqueKey(baseKey: string, existingKeys: string[]): string {
  if (!existingKeys.includes(baseKey)) {
    return baseKey;
  }

  let counter = 1;
  let uniqueKey = `${baseKey}_${counter}`;
  while (existingKeys.includes(uniqueKey)) {
    counter++;
    uniqueKey = `${baseKey}_${counter}`;
  }

  return uniqueKey;
}

export function formatBytes(bytes: number): string {
  if (bytes === 0) return "0 B";
  const k = 1024;
  const sizes = ["B", "KB", "MB", "GB"];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(1))} ${sizes[i]}`;
}

// truncateFileContent: Needed for Agent File Uploads
export function truncateFileContent(
  content: string,
  maxChars: number,
): { truncated: string; wasTruncated: boolean } {
  if (content.length <= maxChars) {
    return { truncated: content, wasTruncated: false };
  }

  const headChars = Math.floor(maxChars * 0.7);
  const tailChars = Math.floor(maxChars * 0.3);

  const head = content.slice(0, headChars);
  const tail = content.slice(-tailChars);

  const originalChars = content.length;
  const omittedChars = originalChars - (headChars + tailChars);

  const truncated = `${head}\n\n... [truncated ${omittedChars.toLocaleString()} characters (~${Math.ceil(omittedChars / 5)} tokens) for context window management] ...\n\n${tail}`;

  return { truncated, wasTruncated: true };
}
