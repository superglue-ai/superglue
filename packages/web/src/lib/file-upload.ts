/**
 * Uploads a file to a presigned URL using PUT method
 * @param file - The file to upload
 * @param uploadUrl - The presigned URL from the backend
 * @param contentType - The MIME type of the file
 * @throws Error if upload fails
 */
export async function uploadFileToPresignedUrl(
  file: File,
  uploadUrl: string,
  contentType: string,
): Promise<void> {
  try {
    const response = await fetch(uploadUrl, {
      method: "PUT",
      headers: {
        "Content-Type": contentType,
      },
      body: file,
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Upload failed: ${response.status} ${response.statusText} - ${errorText}`);
    }
  } catch (error) {
    if (error instanceof Error) {
      throw error;
    }
    throw new Error(`Upload failed: ${String(error)}`);
  }
}
