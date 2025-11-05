import JSZip from 'jszip';

export async function parseZIP(buffer: Buffer): Promise<Record<string, Buffer>> {
    const zip = new JSZip();
    const loadedZip = await zip.loadAsync(buffer);
    const extracted: Record<string, Buffer> = {};

    for (const [filename, file] of Object.entries(loadedZip.files)) {
        if (file.dir) continue;
        if (filename.startsWith('__MACOSX/') || filename.startsWith('._')) continue;

        const content = await file.async('nodebuffer') as Buffer;
        extracted[filename] = content;
    }

    return extracted;
}

