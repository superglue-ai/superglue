import Papa from 'papaparse';
import { gunzip, inflate } from 'zlib';
import { promisify } from 'util';
import sax, { parser } from 'sax';
import * as unzipper from 'unzipper';
import { Readable } from 'stream';
import { DecompressionMethod, FileType } from "@superglue/shared";
import * as XLSX from 'xlsx';



export async function decompressData(compressed: Buffer, method: DecompressionMethod): Promise<Buffer> {
    const gunzipAsync = promisify(gunzip);
    const inflateAsync = promisify(inflate);

    const signature = compressed.slice(0, 4).toString('hex');
    
    if (method == DecompressionMethod.ZIP || method == DecompressionMethod.AUTO && signature.startsWith('504b')) {
      console.log("Decompressing with zip");
      return await decompressZip(compressed);
    }
    else if (method == DecompressionMethod.GZIP || method == DecompressionMethod.AUTO && signature.startsWith('1f8b')) {
      console.log("Decompressing with gzip");
      const buffer = await gunzipAsync(compressed);
      return buffer;
    }
    else if(method == DecompressionMethod.DEFLATE || method == DecompressionMethod.AUTO && signature.startsWith('1f9d')) { 
      console.log("Decompressing with deflate");
      const buffer = await inflateAsync(compressed);
      return buffer;
    }
    return compressed;
  }
  
export async function decompressZip(buffer: Buffer): Promise<Buffer> {
    try {
        const zipStream = await unzipper.Open.buffer(buffer);
        const isExcel = zipStream.files.some(f => 
            f.path === '[Content_Types].xml' || f.path.startsWith('xl/')
        );
        if (isExcel) {
            return buffer;
        }
        const firstFile = zipStream.files?.[0];
        const fileStream = firstFile.stream();
        const chunks: Buffer[] = [];
        for await (const chunk of fileStream) {
            chunks.push(Buffer.from(chunk));
        }
        return Buffer.concat(chunks);
    } catch (error) {
        console.error("Error decompressing zip.", error);
        throw "Error decompressing zip: " + error;
    }
}

export async function parseFile(buffer: Buffer, fileType: FileType): Promise<any> {
    fileType = fileType == FileType.AUTO ? await detectFileType(buffer) : fileType;

    switch (fileType) {
        case FileType.JSON:
        return parseJSON(buffer);
        case FileType.XML:
        return parseXML(buffer);
        case FileType.CSV:
        return parseCSV(buffer);
        case FileType.EXCEL:
        return parseExcel(buffer);
        default:
        throw new Error('Unsupported file type');
    }
}

async function parseCSV(buffer: Buffer): Promise<any> {
    const results: any[] = [];
    const delimiter = detectDelimiter(buffer);
    let current = 0;

    // Convert the first part of the buffer to find the header row
    const sampleSize = Math.min(buffer.length, 4096); // Use first 4KB for header detection
    const sample = buffer.slice(0, sampleSize).toString('utf8');
    const sampleRows = sample.split('\n').slice(0, 10);
    
    // Find the row with the most columns
    const headerRowIndex = sampleRows
        .reduce((maxIndex, row, currentIndex, rows) => 
            (row.split(delimiter).length > rows[maxIndex].split(delimiter).length) 
                ? currentIndex 
                : maxIndex
        , 0);
    const headerValues = sampleRows[headerRowIndex].split(delimiter).map((value: string) => value.trim());
    return new Promise((resolve, reject) => {
        Papa.parse(Readable.from(buffer), {
            delimiter,
            header: false,
            skipEmptyLines: true,
            worker: true,
            transformHeader: (header, index) => {
                // Use the detected header row's values
                return headerValues[index]|| `Column${index + 1}`;
            },
            step: (result, parser) => {
                try { 
                    // Skip the detected header row since Papa.parse will use it as headers
                    const dataObject: { [key: string]: any } = {};
                    if (current > headerRowIndex) {
                        for(let i = 0; i < headerValues.length; i++) {
                            dataObject[headerValues[i]] = result.data[i];
                        }
                        results.push(dataObject);
                    }
                    current++;
                } catch(error) {  
                    console.error("Error parsing CSV", error);
                    parser.abort();
                }
            },
            complete: async () => {
                console.log('Finished parsing CSV');
                if(results?.length == 1) resolve(results[0]);
                else resolve(results);
            },
            error: async (error) => {
                console.error('Failed parsing CSV');
                reject(error);
            },
        });
    });
}
    
async function parseJSON(buffer: Buffer): Promise<any> {
    try {
        let data = JSON.parse(buffer.toString('utf8'));
        return data;
    } catch (error) {
        console.error('Failed parsing JSON');
        throw error;
    }
}
  
async function parseXML(buffer: Buffer): Promise<any[]> {
    const results: any[] = [];
    let currentElement: any = null;
    const elementStack: any[] = [];
    
    return new Promise((resolve, reject) => {
    const parser = sax.createStream(true); // true for strict mode

    parser.on('opentag', (node) => {
        // Create a new object for the current element
        const newElement: any = { };  
        // If there's a current element, add this new one as its child
        if (currentElement) {
        elementStack.push(currentElement); // Push current to stack
        }

        // Update current element
        currentElement = newElement;
    });

    parser.on('text', (text) => {
        if (!currentElement || text?.trim()?.length == 0) {
            return;
        }
        
        if(Object.keys(currentElement)?.length > 0) {
            currentElement["__text"] = text.trim();
        }
        else if(Array.isArray(currentElement)) {
            currentElement.push(text.trim());
        }
        else if(typeof currentElement === "string") {
            currentElement = [currentElement, text.trim()];
        }
        else {
            currentElement = text.trim();
        }
    });

    parser.on('closetag', (tagName) => {
        const parentElement = elementStack.pop();
        if (elementStack.length > 0) {
            if (currentElement) {
                if(!parentElement[tagName]) {
                    parentElement[tagName] = currentElement;
                }
                else if(Array.isArray(parentElement[tagName])) {
                    parentElement[tagName].push(currentElement);
                }
                else {
                    // Convert single value to array when second value is encountered
                    parentElement[tagName] = [parentElement[tagName], currentElement];
                }
            }  
            currentElement = parentElement;
        } else if (currentElement && Object.keys(currentElement).length > 0) {
            results.push(currentElement);
            currentElement = {};
        }
    });

    parser.on('error', (error) => {
        console.error('Failed converting XML to JSON:', error);
        reject(error);
    });

    parser.on('end', async () => {
        try {
            console.log('Finished parsing XML');
            if(results?.length == 1) resolve(results[0]);
            else resolve(results);
        } catch (error) {
            reject(error);
        }
    });

    const readStream = Readable.from(buffer);
    readStream.pipe(parser); // Pipe the file stream to the SAX parser
    });
}

async function parseExcel(buffer: Buffer): Promise<{ [sheetName: string]: any[] }> {
    try {
        const workbook = XLSX.read(buffer, { 
            type: 'buffer',
            cellDates: true
        });
        const result: { [sheetName: string]: any[] } = {};

        for (const sheetName of workbook.SheetNames) {
            const worksheet = workbook.Sheets[sheetName];
            
            // Get all rows with original headers
            const rawRows = XLSX.utils.sheet_to_json<any>(worksheet, { 
                raw: false,
                header: 1
            });

            if (!rawRows?.length) {
                result[sheetName] = [];
                continue;
            }

            // Find the row with max length from first 20 rows
            const headerRowIndex = rawRows
                .slice(0, 20)
                .reduce((maxIndex, row, currentIndex, rows) => 
                    (row.length > rows[maxIndex]?.length || 0) ? currentIndex : maxIndex
                , 0);

            // Get headers from the detected row
            const headers = rawRows[headerRowIndex].map((header: any) => 
                header ? String(header).trim() : ''
            );

            // Process all rows after the header row
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

async function detectFileType(buffer: Buffer): Promise<FileType> {
    // Excel file signatures
    const xlsxSignature = buffer.slice(0, 4).toString('hex');
    if (xlsxSignature === '504b0304') { // XLSX files are ZIP files
        try {
            // Try to parse as XLSX
            XLSX.read(buffer, { type: 'buffer' });
            return FileType.EXCEL;
        } catch {
            // If XLSX parsing fails, continue with other detection
        }
    }

    // Create stream and readline interface
    const sampleSize = Math.min(buffer.length, 1024);
    const sample = buffer.slice(0, sampleSize).toString('utf8');

    try {
        // Wait for the first line
        const trimmedLine = sample.trim();

        // Determine file type
        if (trimmedLine.startsWith('{') || trimmedLine.startsWith('[')) {
        return FileType.JSON;
        } else if (trimmedLine.startsWith('<?xml') || trimmedLine.startsWith('<')) {
        return FileType.XML;
        } else {
        return FileType.CSV;
        }
    } catch (error) {
        throw new Error(`Error reading file: ${error.message}`);
    }
}

function detectDelimiter(buffer: Buffer): string {
    // Convert the first part of the buffer to string to detect the delimiter
    const sampleSize = Math.min(buffer.length, 1024); // Use the first 1KB or less if buffer is smaller
    const sample = buffer.slice(0, sampleSize).toString('utf8');

    // Potential delimiters to check
    const delimiters = [',', '|', '\t', ';', ':'];

    // Count occurrences of each delimiter in the sample
    const counts = delimiters.map(delimiter => ({
        delimiter,
        count: sample.split(delimiter).length - 1
    }));

    // Find the delimiter with the highest count
    const detectedDelimiter = counts.reduce((prev, curr) => {
        return curr.count > prev.count ? curr : prev;
    });

    return detectedDelimiter.delimiter;
}