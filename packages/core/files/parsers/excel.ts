import { SupportedFileType } from '@superglue/shared';
import * as XLSX from 'xlsx';
import * as unzipper from 'unzipper';
import { DetectionPriority, FileParsingStrategy } from '../strategy.js';


export class ExcelStrategy implements FileParsingStrategy {
    readonly fileType = SupportedFileType.EXCEL;
    readonly priority = DetectionPriority.BINARY_SIGNATURE;

    async canHandle(buffer: Buffer): Promise<boolean> {
        // Must be a ZIP file first (PK signature)
        if (buffer.length < 4) return false;
        const signature = buffer.subarray(0, 4).toString('hex');
        if (signature !== '504b0304') return false;

        // Check for Excel-specific files inside the ZIP
        try {
            const zipStream = await unzipper.Open.buffer(buffer);
            const hasExcelSignature = zipStream.files.some(f =>
                f.path === '[Content_Types].xml' ||
                f.path === 'xl/workbook.xml' ||
                f.path.startsWith('xl/worksheets/')
            );
            return hasExcelSignature;
        } catch (error) {
            return false;
        }
    }

    async parse(buffer: Buffer): Promise<any> {
        return parseExcel(buffer);
    }
}

export async function parseExcel(buffer: Buffer): Promise<{ [sheetName: string]: any[] }> {
    try {
        const parsePromise = new Promise<XLSX.WorkBook>((resolve, reject) => {
            try {
                const workbook = XLSX.read(buffer, {
                    type: 'buffer',
                    cellDates: true,
                    dense: false,
                    cellStyles: false
                });
                resolve(workbook);
            } catch (error) {
                reject(error);
            }
        });

        const timeoutPromise = new Promise<never>((_, reject) => {
            setTimeout(() => reject(new Error('Excel parsing timeout after 60 seconds')), 60000);
        });

        const workbook = await Promise.race([parsePromise, timeoutPromise]);
        const result: { [sheetName: string]: any[] } = {};

        for (const sheetName of workbook.SheetNames) {
            const worksheet = workbook.Sheets[sheetName];

            const rawRows = XLSX.utils.sheet_to_json<any>(worksheet, {
                raw: false,
                header: 1,
                defval: null,
                blankrows: true
            });

            if (!rawRows?.length) {
                result[sheetName] = [];
                continue;
            }

            let headerRowIndex = 0;
            for (let i = 0; i < Math.min(rawRows.length, 10); i++) {
                const row = rawRows[i] || [];
                const nonNullCount = row.filter((v: any) => v !== null && v !== undefined && v !== '').length;
                if (nonNullCount >= 2) {
                    headerRowIndex = i;
                    break;
                }
            }

            const headers = rawRows[headerRowIndex].map((header: any, index: number) =>
                header ? String(header).trim() : `Column ${index + 1}`
            );

            const processedRows = rawRows.slice(headerRowIndex + 1).map((row: any) => {
                const obj: { [key: string]: any } = {};
                headers.forEach((header: string, index: number) => {
                    if (header && row[index] !== undefined) {
                        obj[header] = row[index];
                    }
                });
                return obj;
            });

            result[sheetName] = processedRows;
        }

        return result;
    } catch (error) {
        console.error('Failed parsing Excel file:', error);
        throw error;
    }
}

