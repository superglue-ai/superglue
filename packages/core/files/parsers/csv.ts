import { SupportedFileType } from '@superglue/shared';
import Papa from 'papaparse';
import { Readable } from 'stream';
import { DetectionPriority, FileParsingStrategy } from '../strategy.js';


export class CSVStrategy implements FileParsingStrategy {
    readonly fileType = SupportedFileType.CSV;
    readonly priority = DetectionPriority.HEURISTIC_TEXT;

    canHandle(buffer: Buffer): boolean {
        return isLikelyCSV(buffer);
    }

    async parse(buffer: Buffer): Promise<any> {
        return parseCSV(buffer);
    }
}

function isLikelyCSV(buffer: Buffer): boolean {
    const sampleSize = Math.min(buffer.length, 8192);
    const sample = buffer.subarray(0, sampleSize).toString('utf8');
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
    const sample = buffer.subarray(0, sampleSize).toString('utf8');
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
    const sample = buffer.subarray(0, sampleSize);
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

