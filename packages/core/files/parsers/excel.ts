import * as XLSX from 'xlsx';

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

