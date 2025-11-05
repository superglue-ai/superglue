import Papa from 'papaparse';
import { Readable } from 'stream';

async function detectCSVHeaders(sample: Buffer, delimiter: string): Promise<{ headerValues: string[], headerRowIndex: number, delimiter: string }> {
    return new Promise<{ headerValues: string[], headerRowIndex: number, delimiter: string }>((resolve, reject) => {
        Papa.parse(Readable.from(sample), {
            preview: 100,
            header: false,
            skipEmptyLines: false,
            delimiter: delimiter,
            complete: (result) => {
                const headerRowIndex = result.data
                    .reduce<number>((maxIndex: number, row: any[], currentIndex: number, rows: any[][]) =>
                        (row.length > (rows[maxIndex] as any[]).length)
                            ? currentIndex
                            : maxIndex
                        , 0);

                const headerValues = (result.data[headerRowIndex] as string[])
                    .map((value: string, index: number) => value?.trim() || `Column ${index + 1}`);

                resolve({ headerValues, headerRowIndex, delimiter });
            },
            error: (error) => reject(error)
        });
    });
}

function detectDelimiter(buffer: Buffer): string {
    const sampleSize = Math.min(buffer.length, 32768);
    const sample = buffer.slice(0, sampleSize).toString('utf8');
    const delimiters = [',', '|', '\t', ';', ':'];
    const counts = delimiters.map(delimiter => ({
        delimiter,
        count: countUnescapedDelimiter(sample, delimiter)
    }));

    const detectedDelimiter = counts.reduce((prev, curr) => {
        return curr.count > prev.count ? curr : prev;
    });

    if (detectedDelimiter.count === 0) {
        return ',';
    }

    return detectedDelimiter.delimiter;
}

function countUnescapedDelimiter(text: string, delimiter: string): number {
    let count = 0;
    let inQuotes = false;
    let prevChar = '';
    let delimiterLength = delimiter.length;
    for (let i = 0; i < text.length; i++) {
        const currentChar = text[i];
        const searchChar = text.substring(i, i + delimiterLength);
        if (currentChar === '"' && prevChar !== '\\') {
            inQuotes = !inQuotes;
        }
        else if (searchChar === delimiter && !inQuotes) {
            count++;
        }

        prevChar = currentChar;
    }

    return count;
}

export async function parseCSV(buffer: Buffer): Promise<any> {
    const results: any[] = [];
    const metadata: any[] = [];

    const sampleSize = Math.min(buffer.length, 32768);
    const sample = buffer.slice(0, sampleSize);
    const delimiter = detectDelimiter(sample);
    const { headerValues, headerRowIndex } = await detectCSVHeaders(sample, delimiter);
    let rawHeader = [];
    let currentLine = -1;
    return new Promise((resolve, reject) => {
        Papa.parse(Readable.from(buffer), {
            header: false,
            skipEmptyLines: false,
            delimiter: delimiter,
            step: (result: { data: any[] }, parser) => {
                try {
                    currentLine++;
                    if (currentLine == headerRowIndex) {
                        rawHeader = result.data.filter(Boolean).reduce((acc, value, index) => {
                            acc[`${index}`] = value;
                            return acc;
                        }, {});
                        return;
                    }
                    else if (currentLine < headerRowIndex) {
                        if (result.data == null || result.data?.filter(Boolean).length == 0) return;
                        metadata.push(result?.data);
                        return;
                    }
                    if (result.data == null || result.data.map((value: any) => value?.trim()).filter(Boolean).length == 0) return;
                    const dataObject: { [key: string]: any } = {};
                    for (let i = 0; i < headerValues.length; i++) {
                        dataObject[headerValues[i]] = result.data[i];
                    }
                    results.push(dataObject);
                } catch (error) {
                    parser.abort();
                }
            },
            complete: () => {
                if (metadata.length > 0) {
                    resolve({
                        data: results,
                        metadata
                    });
                }
                else {
                    if (results.length > 0) {
                        resolve(results);
                    }
                    else {
                        resolve(rawHeader);
                    }
                }
            },
            error: (error) => {
                reject(error);
            },
        });
    });
}

