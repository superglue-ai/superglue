import * as unzipper from 'unzipper';

export async function detectFileType(buffer: Buffer): Promise<string> {
    const signature = buffer.slice(0, 4).toString('hex');

    if (signature === '25504446') {
        return 'PDF';
    }

    if (signature === '504b0304') {
        try {
            const zipStream = await unzipper.Open.buffer(buffer);

            const hasExcelSignature = zipStream.files.some(f =>
                f.path === '[Content_Types].xml' ||
                f.path === 'xl/workbook.xml' ||
                f.path.startsWith('xl/worksheets/')
            );
            if (hasExcelSignature) {
                return 'EXCEL';
            }

            const hasWordSignature = zipStream.files.some(f =>
                f.path === 'word/document.xml' ||
                f.path.startsWith('word/')
            );
            if (hasWordSignature) {
                return 'DOCX';
            }

            return 'ZIP';
        } catch (error) {
            console.error('Failed to detect ZIP file type:', error);
            return 'ZIP';
        }
    }

    const sampleSize = Math.min(buffer.length, 4096);
    const sample = buffer.slice(0, sampleSize).toString('utf8');

    try {
        const trimmedLine = sample.trim();

        if (trimmedLine.startsWith('{') || trimmedLine.startsWith('[')) {
            return 'JSON';
        } else if (trimmedLine.startsWith('<?xml') || trimmedLine.startsWith('<')) {
            return 'XML';
        } else if (isLikelyCSV(buffer)) {
            return 'CSV';
        } else {
            return 'RAW';
        }
    } catch (error) {
        throw new Error(`Error reading file: ${(error as Error).message}`);
    }
}

function isLikelyCSV(buffer: Buffer): boolean {
    const sampleSize = Math.min(buffer.length, 8192);
    const sample = buffer.slice(0, sampleSize).toString('utf8');
    const lines = sample.split(/\r?\n/).filter(line => line.length > 0).slice(0, 10);

    if (lines.length < 2) return false;

    const delimiters = [',', '\t', ';', '|'];

    for (const delimiter of delimiters) {
        const delimiterCounts = lines.map(line => {
            return (line.match(new RegExp(`\\${delimiter}`, 'g')) || []).length;
        });

        if (Math.max(...delimiterCounts) === 0) continue;

        const nonZeroCounts = delimiterCounts.filter(count => count > 0);
        if (nonZeroCounts.length >= lines.length * 0.7) {
            const avgCount = nonZeroCounts.reduce((a, b) => a + b, 0) / nonZeroCounts.length;
            const consistentLines = delimiterCounts.filter(count =>
                count === 0 || Math.abs(count - avgCount) <= Math.max(2, avgCount * 0.3)
            ).length;

            if (consistentLines >= lines.length * 0.8) {
                return true;
            }
        }
    }

    return false;
}

