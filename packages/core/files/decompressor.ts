import { promisify } from 'util';
import { gunzip, inflate } from 'zlib';

const gunzipAsync = promisify(gunzip);
const inflateAsync = promisify(inflate);

export async function decompressData(compressed: Buffer, method: string): Promise<Buffer> {
    const signature = compressed.slice(0, 4).toString('hex');

    if (method === 'GZIP' || (method === 'AUTO' && signature.startsWith('1f8b'))) {
        const buffer = await gunzipAsync(compressed);
        return buffer;
    }
    else if (method === 'DEFLATE' || (method === 'AUTO' && signature.startsWith('1f9d'))) {
        const buffer = await inflateAsync(compressed);
        return buffer;
    }

    return compressed;
}

