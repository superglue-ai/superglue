import Papa from 'papaparse';
import { gunzip, inflate } from 'zlib';
import { promisify } from 'util';
import sax from 'sax';
import * as unzipper from 'unzipper';
import { Readable } from 'stream';
import { DecompressionMethod, FileType } from "@superglue/shared";



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
    const zipStream = await unzipper.Open.buffer(buffer);
    const firstFile = zipStream.files?.[0];

    if (!firstFile) {
        throw new Error("No files found in the ZIP archive.");
    }

    const fileStream = firstFile.stream();

    // Collect the stream data into a buffer
    const chunks: Buffer[] = [];
    for await (const chunk of fileStream) {
        chunks.push(Buffer.from(chunk));
    }
    return Buffer.concat(chunks);
}

export async function parseFile(buffer: Buffer, fileType: FileType): Promise<any[]> {
    fileType = fileType == FileType.AUTO ? await detectFileType(buffer) : fileType;

    switch (fileType) {
        case FileType.JSON:
        return parseJSON(buffer);
        case FileType.XML:
        return parseXML(buffer);
        case FileType.CSV: {
        return parseCSV(buffer);
        }
        default:
        throw new Error('Unsupported file type');
    }
}

async function parseCSV(buffer: Buffer): Promise<any[]> {
    const results: any[] = [];
    const delimiter = detectDelimiter(buffer);
    let current = 0;
    return new Promise((resolve, reject) => {
    Papa.parse(Readable.from(buffer), {
        delimiter,
        header: true,
        skipEmptyLines: false,
        worker: true,
        step: (result, parser) => {
        try { 
            current++;
            results.push(result.data);
        } catch(error) {  
            console.error("Error parsing CSV", error);
            parser.abort();
        }
        },
        complete: async () => {
        console.log('Finished parsing CSV');
        resolve(results);
        },
        error: async (error) => {
        console.error('Failed parsing CSV');
        reject(error);
        },
    });
    });
}
    
async function parseJSON(buffer: Buffer): Promise<any[]> {
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
        if (currentElement && text.trim().length > 0) {
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
        }
    });

    parser.on('closetag', (tagName) => {
        // When closing a tag, pop from stack and push completed element to results
        const cLocal = elementStack.pop();
        if (elementStack.length > 0) {
        const parentElement = elementStack[elementStack.length - 1];
        if (currentElement) {
            if(!parentElement[tagName]) {
            parentElement[tagName] = currentElement;
            }
            else if(Array.isArray(currentElement[tagName])) {
            currentElement[tagName].push(currentElement);
            }
            else {
            currentElement[tagName] = [currentElement[tagName], currentElement];
            }
        }  
        currentElement = parentElement;
        } else {
        results.push(cLocal);
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
        resolve(results);
        } catch (error) {
        reject(error);
        }
    });

    const readStream = Readable.from(buffer);
    readStream.pipe(parser); // Pipe the file stream to the SAX parser
    });
}

    
async function detectFileType(buffer: Buffer): Promise<FileType> {
    // Create stream and readline interface
    const sampleSize = Math.min(buffer.length, 1024); // Use the first 1KB or less if buffer is smaller
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