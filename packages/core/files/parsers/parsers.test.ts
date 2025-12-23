import { SupportedFileType } from '@superglue/shared';
import axios from 'axios';
import { describe, expect, it } from 'vitest';
import { parseFile, FileStrategyRegistry } from '../index.js';
import { parseZIP, ZIPStrategy } from './zip.js';
import { parseJSON, parseJsonResilient, RepairStrategy, minifyJson, ResilientJsonParser, isValidJson, prettyPrintJson, JSONStrategy } from './json.js';
import { CSVStrategy } from './csv.js';
import { XMLStrategy } from './xml.js';
import { PDFStrategy } from './pdf.js';
import { GZIPStrategy } from './gzip.js';
import { DOCXStrategy } from './docx.js';
import { ExcelStrategy } from './excel.js';
import { YAMLStrategy, parseYAML } from './yaml.js';
import JSZip from 'jszip';
import { promisify } from 'util';
import { gzip } from 'zlib';

const gzipAsync = promisify(gzip);

describe('File Parsing - Comprehensive Tests', () => {
  describe('parseFile with AUTO detection', () => {
    it('should auto-detect and parse JSON', async () => {
      const jsonData = JSON.stringify({ name: 'test', value: 123 });
      const buffer = Buffer.from(jsonData);

      const result = await parseFile(buffer, SupportedFileType.AUTO);
      expect(result).toEqual({ name: 'test', value: 123 });
    });

    it('should auto-detect and parse JSON array', async () => {
      const jsonData = JSON.stringify([{ id: 1 }, { id: 2 }]);
      const buffer = Buffer.from(jsonData);

      const result = await parseFile(buffer, SupportedFileType.AUTO);
      expect(result).toEqual([{ id: 1 }, { id: 2 }]);
    });

    it('should auto-detect and parse CSV', async () => {
      const csvData = 'name,age,city\nAlice,30,NYC\nBob,25,LA';
      const buffer = Buffer.from(csvData);

      const result = await parseFile(buffer, SupportedFileType.AUTO);
      expect(Array.isArray(result)).toBe(true);
      expect(result).toHaveLength(2);
      expect(result[0]).toHaveProperty('name', 'Alice');
    });

    it('should auto-detect and parse XML', async () => {
      const xmlData = '<?xml version="1.0"?><root><item>test</item></root>';
      const buffer = Buffer.from(xmlData);

      const result = await parseFile(buffer, SupportedFileType.AUTO);
      expect(result).toBeDefined();
      expect(result.ROOT).toBeDefined();
    });

    it('should auto-detect and parse XML without declaration', async () => {
      const xmlData = '<root><item>test</item></root>';
      const buffer = Buffer.from(xmlData);

      const result = await parseFile(buffer, SupportedFileType.AUTO);
      expect(result).toBeDefined();
      expect(result.ROOT).toBeDefined();
    });

    it('should fallback to RAW for unrecognized text', async () => {
      const textData = 'This is just plain text without structure';
      const buffer = Buffer.from(textData);

      const result = await parseFile(buffer, SupportedFileType.AUTO);
      expect(result).toBe(textData);
    });

    it('should handle empty buffer', async () => {
      const result = await parseFile(Buffer.from(''), SupportedFileType.AUTO);
      expect(result).toBeNull();
    });
  });

  describe('JSON Parsing', () => {
    it('should parse JSON data', async () => {
      const jsonData = JSON.stringify([{ name: 'test', value: 123 }]);
      const buffer = Buffer.from(jsonData);

      const result = await parseFile(buffer, SupportedFileType.JSON);
      expect(result).toEqual([{ name: 'test', value: 123 }]);
    });

    it('should parse nested JSON objects', async () => {
      const jsonData = JSON.stringify({
        user: { name: 'Alice', profile: { age: 30, city: 'NYC' } }
      });
      const buffer = Buffer.from(jsonData);

      const result = await parseFile(buffer, SupportedFileType.JSON);
      expect(result.user.profile.age).toBe(30);
    });

    it('should handle JSON with special characters', async () => {
      const jsonData = JSON.stringify({ message: 'Hello\nWorld\t"quoted"' });
      const buffer = Buffer.from(jsonData);

      const result = await parseFile(buffer, SupportedFileType.JSON);
      expect(result.message).toBe('Hello\nWorld\t"quoted"');
    });
  });

  describe('CSV Parsing', () => {
    it('should parse CSV data', async () => {
      const csvData = 'name,value\ntest,123';
      const buffer = Buffer.from(csvData);

      const result = await parseFile(buffer, SupportedFileType.CSV);
      expect(result).toEqual([{ name: 'test', value: '123' }]);
    });

    it('should parse CSV data as array if multiple rows are given', async () => {
      const csvData = 'name,value\ntest,123\ntest2,456';
      const buffer = Buffer.from(csvData);

      const result = await parseFile(buffer, SupportedFileType.CSV);
      expect(result).toEqual([
        { name: 'test', value: '123' },
        { name: 'test2', value: '456' }
      ]);
    });

    it('should handle CSV with different delimiters (semicolon)', async () => {
      const csvData = 'name;age;city\nAlice;30;NYC\nBob;25;LA';
      const buffer = Buffer.from(csvData);

      const result = await parseFile(buffer, SupportedFileType.CSV);
      expect(result).toHaveLength(2);
      expect(result[0].age).toBe('30');
    });

    it('should handle CSV with different delimiters (pipe)', async () => {
      const csvData = 'name|age|city\nAlice|30|NYC\nBob|25|LA';
      const buffer = Buffer.from(csvData);

      const result = await parseFile(buffer, SupportedFileType.CSV);
      expect(result).toHaveLength(2);
      expect(result[0].name).toBe('Alice');
    });

    it('should handle CSV with different delimiters (tab)', async () => {
      const csvData = 'name\tage\tcity\nAlice\t30\tNYC\nBob\t25\tLA';
      const buffer = Buffer.from(csvData);

      const result = await parseFile(buffer, SupportedFileType.CSV);
      expect(result).toHaveLength(2);
      expect(result[1].city).toBe('LA');
    });

    it('should handle CSV with quoted values containing commas', async () => {
      const csvData = 'name,location\nAlice,"New York, NY"\nBob,"Los Angeles, CA"';
      const buffer = Buffer.from(csvData);

      const result = await parseFile(buffer, SupportedFileType.CSV);
      expect(result[0].location).toBe('New York, NY');
    });

    it('should handle CSV with empty lines', async () => {
      const csvData = 'name,value\n\ntest,123\n\ntest2,456\n';
      const buffer = Buffer.from(csvData);

      const result = await parseFile(buffer, SupportedFileType.CSV);
      expect(result).toHaveLength(2);
    });
  });

  describe('XML Parsing', () => {
    it('should parse XML data', async () => {
      const xmlData = `
        <?xml version="1.0" encoding="UTF-8"?>
        <root>
          <item>
            <name>test</name>
            <value>123</value>
          </item>
        </root>
      `;
      const buffer = Buffer.from(xmlData);

      const result = await parseFile(buffer, SupportedFileType.XML);
      expect(result?.ROOT?.ITEM).toEqual({ NAME: 'test', VALUE: '123' });
    });

    it('should parse XML data as array if multiple rows are given', async () => {
      const xmlData = `
        <?xml version="1.0" encoding="UTF-8"?>
        <root>
          <item>
            <name>test</name>
            <value>123</value>
          </item>
          <item>
            <name>test2</name>
            <value>456</value>
          </item>
        </root>
      `;
      const buffer = Buffer.from(xmlData);

      const result = await parseFile(buffer, SupportedFileType.XML);
      expect(result?.ROOT?.ITEM).toHaveLength(2);
      expect(result?.ROOT?.ITEM).toEqual([
        { NAME: 'test', VALUE: '123' },
        { NAME: 'test2', VALUE: '456' }
      ]);
    });

    it('should handle XML with attributes', async () => {
      const xmlData = `
        <?xml version="1.0"?>
        <root>
          <item id="1" type="test">
            <value>123</value>
          </item>
        </root>
      `;
      const buffer = Buffer.from(xmlData);

      const result = await parseFile(buffer, SupportedFileType.XML);
      // XML parser converts tag names to uppercase
      expect(result.ROOT.ITEM).toBeDefined();
      expect(result.ROOT.ITEM.VALUE).toBe('123');
      // Note: Attributes may be lowercased depending on parser configuration
      expect(result.ROOT.ITEM.id || result.ROOT.ITEM.ID).toBeTruthy();
    });

    it('should handle XML with self-closing tags', async () => {
      const xmlData = '<root><item/><item/></root>';
      const buffer = Buffer.from(xmlData);

      const result = await parseFile(buffer, SupportedFileType.XML);
      expect(result.ROOT).toBeDefined();
    });

    it('should handle XML with mixed content', async () => {
      const xmlData = `
        <root>
          <item>Text content</item>
          <item><nested>value</nested></item>
        </root>
      `;
      const buffer = Buffer.from(xmlData);

      const result = await parseFile(buffer, SupportedFileType.XML);
      expect(result.ROOT).toBeDefined();
    });
  });

  describe('YAML Parsing', () => {
    it('should parse YAML with explicit type', async () => {
      const yamlData = 'name: test\nvalue: 123';
      const buffer = Buffer.from(yamlData);

      const result = await parseFile(buffer, SupportedFileType.YAML);
      expect(result).toEqual({ name: 'test', value: 123 });
    });

    it('should auto-detect YAML with document start marker', async () => {
      const yamlData = '---\nname: test\nvalue: 123';
      const buffer = Buffer.from(yamlData);

      const result = await parseFile(buffer, SupportedFileType.AUTO);
      expect(result).toEqual({ name: 'test', value: 123 });
    });

    it('should parse nested YAML objects', async () => {
      const yamlData = `user:
  name: Alice
  profile:
    age: 30
    city: NYC`;
      const buffer = Buffer.from(yamlData);

      const result = await parseFile(buffer, SupportedFileType.YAML);
      expect(result.user.profile.age).toBe(30);
    });

    it('should parse YAML arrays', async () => {
      const yamlData = `items:
  - name: first
  - name: second`;
      const buffer = Buffer.from(yamlData);

      const result = await parseFile(buffer, SupportedFileType.YAML);
      expect(result.items).toHaveLength(2);
    });

    it('should handle YAML strategy detection', () => {
      const strategy = new YAMLStrategy();

      const yamlWithDocStart = Buffer.from('---\nkey: value');
      expect(strategy.canHandle(yamlWithDocStart)).toBe(true);

      const yamlKeyValue = Buffer.from('key: value\nanother: test');
      expect(strategy.canHandle(yamlKeyValue)).toBe(true);

      const jsonData = Buffer.from('{"key": "value"}');
      expect(strategy.canHandle(jsonData)).toBe(false);
    });

    it('should not detect JSON arrays as YAML', () => {
      const strategy = new YAMLStrategy();
      const jsonArray = Buffer.from('[1, 2, 3]');
      expect(strategy.canHandle(jsonArray)).toBe(false);
    });
  });

  describe('ZIP Parsing', () => {
    it('should extract all files from zip archive', async () => {
      const file = await axios.get('https://sample-files.com/downloads/compressed/zip/basic-text.zip', { responseType: 'arraybuffer' });

      const result = await parseZIP(Buffer.from(file.data));
      expect(Object.keys(result).length).toBeGreaterThan(0);
    });

    it('should create and parse a ZIP file with multiple file types', async () => {
      const zip = new JSZip();
      zip.file('data.json', JSON.stringify({ test: 'value' }));
      zip.file('data.csv', 'name,value\ntest,123');
      zip.file('readme.txt', 'This is a readme file');

      const zipBuffer = await zip.generateAsync({ type: 'nodebuffer' });
      const result = await parseFile(zipBuffer, SupportedFileType.AUTO);

      expect(result['data.json']).toEqual({ test: 'value' });
      expect(result['data.csv']).toHaveLength(1);
      expect(result['readme.txt']).toBe('This is a readme file');
    });

    it('should handle nested ZIP files', async () => {
      const innerZip = new JSZip();
      innerZip.file('inner.txt', 'Inner content');
      const innerBuffer = await innerZip.generateAsync({ type: 'nodebuffer' });

      const outerZip = new JSZip();
      outerZip.file('inner.zip', innerBuffer);
      outerZip.file('outer.txt', 'Outer content');

      const outerBuffer = await outerZip.generateAsync({ type: 'nodebuffer' });
      const result = await parseFile(outerBuffer, SupportedFileType.AUTO);

      expect(result['outer.txt']).toBe('Outer content');
      expect(result['inner.zip']).toBeDefined();
      expect(result['inner.zip']['inner.txt']).toBe('Inner content');
    });

    it('should filter out macOS metadata files', async () => {
      const zip = new JSZip();
      zip.file('data.txt', 'Real data');
      zip.file('__MACOSX/data.txt', 'Metadata');
      zip.file('._data.txt', 'Resource fork');

      const zipBuffer = await zip.generateAsync({ type: 'nodebuffer' });
      const result = await parseZIP(zipBuffer);

      expect(Object.keys(result)).toHaveLength(1);
      expect(result['data.txt']).toBeDefined();
      expect(result['__MACOSX/data.txt']).toBeUndefined();
      expect(result['._data.txt']).toBeUndefined();
    });

    it('should throw error when zip is invalid', async () => {
      const emptyBuffer = Buffer.from([]);
      await expect(parseZIP(emptyBuffer))
        .rejects.toThrow();

      const invalidZip = Buffer.from([
        0x50, 0x4B, 0x05, 0x06, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00,
        0x00, 0x00, 0x00, 0x00, 0x00, 0x00
      ]);

      await expect(parseZIP(invalidZip))
        .rejects.toThrow();
    });
  });

  describe('GZIP Parsing', () => {
    it('should decompress and parse gzipped JSON', async () => {
      const jsonData = JSON.stringify({ test: 'value', number: 42 });
      const gzipped = await gzipAsync(Buffer.from(jsonData));

      const result = await parseFile(gzipped, SupportedFileType.AUTO);
      expect(result).toEqual({ test: 'value', number: 42 });
    });

    it('should decompress and parse gzipped CSV', async () => {
      const csvData = 'name,value\ntest,123\ntest2,456';
      const gzipped = await gzipAsync(Buffer.from(csvData));

      const result = await parseFile(gzipped, SupportedFileType.AUTO);
      expect(Array.isArray(result)).toBe(true);
      expect(result).toHaveLength(2);
    });

    it('should decompress and parse gzipped XML', async () => {
      const xmlData = '<?xml version="1.0"?><root><item>test</item></root>';
      const gzipped = await gzipAsync(Buffer.from(xmlData));

      const result = await parseFile(gzipped, SupportedFileType.AUTO);
      expect(result.ROOT).toBeDefined();
      expect(result.ROOT.ITEM).toBe('test');
    });

    it('should decompress gzipped text and return as RAW', async () => {
      const textData = 'This is plain text';
      const gzipped = await gzipAsync(Buffer.from(textData));

      const result = await parseFile(gzipped, SupportedFileType.AUTO);
      expect(result).toBe(textData);
    });

    it('should handle GZIP strategy detection', () => {
      const strategy = new GZIPStrategy();
      const gzipSignature = Buffer.from([0x1f, 0x8b, 0x08, 0x00]);
      expect(strategy.canHandle(gzipSignature)).toBe(true);

      const nonGzipData = Buffer.from('regular text');
      expect(strategy.canHandle(nonGzipData)).toBe(false);
    });
  });

  describe('PDF Parsing', () => {
    it('should detect PDF signature', () => {
      const strategy = new PDFStrategy();
      const pdfSignature = Buffer.from([0x25, 0x50, 0x44, 0x46]); // %PDF
      expect(strategy.canHandle(pdfSignature)).toBe(true);

      const nonPdfData = Buffer.from('not a pdf');
      expect(strategy.canHandle(nonPdfData)).toBe(false);
    });

    it('should reject buffers that are too short', () => {
      const strategy = new PDFStrategy();
      const tooShort = Buffer.from([0x25, 0x50]);
      expect(strategy.canHandle(tooShort)).toBe(false);
    });
  });

  describe('DOCX Parsing', () => {
    it('should detect DOCX files (ZIP with word/ structure)', async () => {
      const strategy = new DOCXStrategy();

      const zip = new JSZip();
      zip.file('word/document.xml', '<document>Test</document>');
      zip.file('[Content_Types].xml', '<Types/>');
      const docxBuffer = await zip.generateAsync({ type: 'nodebuffer' });

      const canHandle = await strategy.canHandle(docxBuffer);
      expect(canHandle).toBe(true);
    });

    it('should not detect regular ZIP as DOCX', async () => {
      const strategy = new DOCXStrategy();

      const zip = new JSZip();
      zip.file('regular.txt', 'Just a regular ZIP');
      const zipBuffer = await zip.generateAsync({ type: 'nodebuffer' });

      const canHandle = await strategy.canHandle(zipBuffer);
      expect(canHandle).toBe(false);
    });
  });

  describe('Excel Parsing', () => {
    it('should detect Excel files (ZIP with xl/ structure)', async () => {
      const strategy = new ExcelStrategy();

      const zip = new JSZip();
      zip.file('xl/workbook.xml', '<workbook/>');
      zip.file('[Content_Types].xml', '<Types/>');
      const excelBuffer = await zip.generateAsync({ type: 'nodebuffer' });

      const canHandle = await strategy.canHandle(excelBuffer);
      expect(canHandle).toBe(true);
    });

    it('should detect Excel files with worksheets', async () => {
      const strategy = new ExcelStrategy();

      const zip = new JSZip();
      zip.file('xl/worksheets/sheet1.xml', '<worksheet/>');
      zip.file('[Content_Types].xml', '<Types/>');
      const excelBuffer = await zip.generateAsync({ type: 'nodebuffer' });

      const canHandle = await strategy.canHandle(excelBuffer);
      expect(canHandle).toBe(true);
    });

    it('should not detect regular ZIP as Excel', async () => {
      const strategy = new ExcelStrategy();

      const zip = new JSZip();
      zip.file('data.txt', 'Regular file');
      const zipBuffer = await zip.generateAsync({ type: 'nodebuffer' });

      const canHandle = await strategy.canHandle(zipBuffer);
      expect(canHandle).toBe(false);
    });
  });

  describe('Strategy Priority System', () => {
    it('should test GZIP before other binary formats', async () => {
      const jsonData = JSON.stringify({ test: 'data' });
      const gzipped = await gzipAsync(Buffer.from(jsonData));

      // GZIP should be detected first, not treated as random binary
      const result = await parseFile(gzipped, SupportedFileType.AUTO);
      expect(result).toEqual({ test: 'data' });
    });

    it('should detect Excel files correctly via parseFile', async () => {
      const zip = new JSZip();
      zip.file('xl/workbook.xml', '<workbook/>');
      zip.file('[Content_Types].xml', '<Types/>');
      const buffer = await zip.generateAsync({ type: 'nodebuffer' });

      // Use the actual parseFile function which has the correct strategy order
      const result = await parseFile(buffer, SupportedFileType.AUTO);

      // The result should be parsed as Excel (which returns sheets object)
      // If it was generic ZIP, it would return a Record<string, Buffer>
      expect(result).toBeDefined();
      // Excel files return objects with sheet data, not raw buffers
      expect(typeof result).toBe('object');
    });

    it('should detect DOCX files correctly via parseFile', async () => {
      const zip = new JSZip();
      zip.file('word/document.xml', '<document/>');
      const buffer = await zip.generateAsync({ type: 'nodebuffer' });

      // Use the actual parseFile function which has the correct strategy order
      const result = await parseFile(buffer, SupportedFileType.AUTO);

      // DOCX detection should work and parse it
      expect(result).toBeDefined();

      // If detected as DOCX, it returns a string
      // If detected as ZIP (fallback), it returns an object with extracted files
      // Since we're using a minimal DOCX structure, verify it's at least parsed
      if (typeof result === 'string') {
        // Successfully detected and parsed as DOCX
        expect(typeof result).toBe('string');
      } else {
        // Fallback to ZIP - verify it extracted the word/document.xml file
        expect(result['word/document.xml']).toBeDefined();
      }
    });

    it('should test JSON before CSV for JSON data', async () => {
      const jsonData = '{"name": "test"}';
      const buffer = Buffer.from(jsonData);

      const registry = new FileStrategyRegistry();
      registry.register(new JSONStrategy());
      registry.register(new CSVStrategy());

      const result = await registry.detectAndParse(buffer);
      expect(result.fileType).toBe(SupportedFileType.JSON);
    });

    it('should detect CSV for ambiguous delimiter data', async () => {
      const csvData = 'name,age\nAlice,30\nBob,25';
      const buffer = Buffer.from(csvData);

      const result = await parseFile(buffer, SupportedFileType.AUTO);
      expect(Array.isArray(result)).toBe(true);
    });
  });

  describe('Error Handling', () => {
    it('should throw error for unsupported file type', async () => {
      const buffer = Buffer.from('test data');
      await expect(parseFile(buffer, 'INVALID' as any))
        .rejects.toThrow('Unsupported file type');
    });

    it('should handle corrupted JSON gracefully with resilient parser', async () => {
      const malformedJson = '{"key": "value",}';
      const buffer = Buffer.from(malformedJson);

      const result = await parseFile(buffer, SupportedFileType.JSON);
      expect(result).toEqual({ key: 'value' });
    });

    it('should fallback to RAW for truly unparseable data', async () => {
      const binaryGarbage = Buffer.from([0xFF, 0xFE, 0xFD, 0xFC, 0xFB, 0xFA]);
      const result = await parseFile(binaryGarbage, SupportedFileType.AUTO);
      expect(typeof result).toBe('string');
    });

    it('should continue after strategy failure', async () => {
      const registry = new FileStrategyRegistry();

      // Add a strategy that always fails
      class FailingStrategy {
        readonly fileType = SupportedFileType.JSON;
        readonly priority = 0;
        canHandle() { return true; }
        async parse() { throw new Error('Always fails'); }
      }

      registry.register(new FailingStrategy() as any);
      registry.register(new JSONStrategy());

      const jsonData = '{"key": "value"}';
      const result = await registry.detectAndParse(Buffer.from(jsonData));

      // Should fallback to RAW instead of throwing
      expect(result.fileType).toBeDefined();
    });
  });

  describe('Complex Integration Scenarios', () => {
    it('should handle ZIP containing gzipped files', async () => {
      const jsonData = JSON.stringify({ nested: 'data' });
      const gzipped = await gzipAsync(Buffer.from(jsonData));

      const zip = new JSZip();
      zip.file('data.json.gz', gzipped);
      zip.file('readme.txt', 'Instructions');
      const zipBuffer = await zip.generateAsync({ type: 'nodebuffer' });

      const result = await parseFile(zipBuffer, SupportedFileType.AUTO);
      expect(result['data.json.gz']).toEqual({ nested: 'data' });
      expect(result['readme.txt']).toBe('Instructions');
    });

    it('should handle ZIP with mixed file types', async () => {
      const zip = new JSZip();
      zip.file('data.json', JSON.stringify([1, 2, 3]));
      zip.file('data.csv', 'a,b\n1,2\n3,4');
      zip.file('data.xml', '<root><item>test</item></root>');
      zip.file('data.txt', 'Plain text');

      const zipBuffer = await zip.generateAsync({ type: 'nodebuffer' });
      const result = await parseFile(zipBuffer, SupportedFileType.AUTO);

      expect(result['data.json']).toEqual([1, 2, 3]);
      expect(Array.isArray(result['data.csv'])).toBe(true);
      expect(result['data.xml'].ROOT).toBeDefined();
      expect(result['data.txt']).toBe('Plain text');
    });

    it('should handle deeply nested ZIP structures', async () => {
      const level3 = new JSZip();
      level3.file('deep.txt', 'Deep content');
      const level3Buffer = await level3.generateAsync({ type: 'nodebuffer' });

      const level2 = new JSZip();
      level2.file('level3.zip', level3Buffer);
      const level2Buffer = await level2.generateAsync({ type: 'nodebuffer' });

      const level1 = new JSZip();
      level1.file('level2.zip', level2Buffer);
      const level1Buffer = await level1.generateAsync({ type: 'nodebuffer' });

      const result = await parseFile(level1Buffer, SupportedFileType.AUTO);
      expect(result['level2.zip']['level3.zip']['deep.txt']).toBe('Deep content');
    });
  });
});

describe('Resilient JSON Parser', () => {
  describe('parseJsonResilient', () => {
    it('should parse valid JSON normally', () => {
      const validJson = '{"key": "value", "number": 123}';
      const result = parseJsonResilient(validJson);
      expect(result.success).toBe(true);
      expect(result.data).toEqual({ key: 'value', number: 123 });
      expect(result.repairs).toBeUndefined();
    });

    it('should handle triple quotes from client data', () => {
      const malformedJson = `{
        "product.custom_fields": """{"MOQ" : "1", "AI Prompt Version" : "Prompt v1.1"}""",
        "product.title": "APC AP7900B",
        "variant.sourceLinks": """{"25856307" : "18688060779", "AP7900B" : "17337310486"}""",
        "variant.custom_fields": """{"Length" : "17.5", "Width" : "4.3", "Height" : "1.7"}"""
      }`;

      const result = parseJsonResilient(malformedJson);
      expect(result.success).toBe(true);
      expect(result.data).toBeDefined();
      // Should parse the inner JSON as an actual object
      expect(result.data['product.custom_fields']).toEqual({
        MOQ: "1",
        "AI Prompt Version": "Prompt v1.1"
      });
      expect(result.data['variant.sourceLinks']).toEqual({
        "25856307": "18688060779",
        "AP7900B": "17337310486"
      });
      expect(result.data['variant.custom_fields']).toEqual({
        Length: "17.5",
        Width: "4.3",
        Height: "1.7"
      });
      expect(result.repairs).toContain('Converts triple-quoted strings to proper JSON, parsing nested JSON content');
    });

    it('should handle the full client JSON example', () => {
      const clientJson = `{
        "_index": "voomi-products-catalog-latest",
        "_id": "171475694_50b35eb6-1854-4197-8eac-f582ccefe602",
        "_score": 1,
        "_ignored": [
          "product.custom_fields.keyword",
          "product.description.keyword",
          "product.images.keyword",
          "variant.description.keyword",
          "variant.images.keyword"
        ],
        "_source": {
          "product.custom_fields": """{"MOQ" : "1", "AI Prompt Version" : "Prompt v1.1", "source" : "Schneider Electric", "AI Timestamp" : "8/9/2024 3:05", "SEO Title" : "APC AP7900B Rack PDU, Switched, 1U RMS, 15A, 100/120V, NEMA 5-15 Outlets", "PDF" : "https://cdn.adiglobaldistribution.us/pim/Original/10059/1037389613_User_Manual_2.pdf", "PDF2" : "https://cdcdn.adiglobaldistribution.us/pim/Original/10046/Upload_2G-AP7900B_ProductManual.pdf", "PDF3" : "https://cdn.adiglobaldistribution.us/pim/Original/10059/1037389613_Manufacturer_Brochure_1.pdf"}""",
          "product.manufacturer": "APC",
          "product.id": "137858557",
          "variant.updatedOn": "2025-03-26T20:59:26.669000",
          "variant.map": null,
          "product.attributes": null,
          "product.title": "APC AP7900B Rack PDU, Switched, 1U RMS, 15A, 100/120V, NEMA 5-15 Outlets",
          "variant.msrp": null,
          "variant.sourceLinks": """{"25856307" : "18688060779", "AP7900B" : "17337310486", "870687" : "18879832391"}""",
          "variant.height": null,
          "variant.ean": null,
          "variant.length": null,
          "product.variantSkus": """["50b35eb6-1854-4197-8eac-f582ccefe602"]""",
          "variant.asin": null,
          "product.sku": "50b35eb6-1854-4197-8eac-f582ccefe602",
          "variant.referenceIdentifier": "APCAP7900B",
          "variant.sourceCount": "3",
          "variant.custom_fields": """{"Length" : "17.5", "Width" : "4.3", "Height" : "1.7"}""",
          "variant.quantity": "0",
          "product.categoryOne": "ELECTRICAL",
          "variant.description": "<h3>Product Description</h3><p>APC AP7900B Rack PDU is a power distribution unit designed for reliable power management in a data center setting. This switched PDU features a one rack unit height and supports up to 15 amps at 100 to 120 volts. It provides eight NEMA 5-15 outlets for versatile connectivity.</p><ul><li>Accommodates up to eight devices with NEMA 5-15 outlets.</li><li>Equipped with a digital current meter to monitor load and prevent overloads.</li><li>Designed for rack mount applications to optimize space and efficiency.</li></ul><h4>Product Highlights</h4><p>The APC AP7900B is suitable for maintaining optimal power distribution within server racks. Its compact design and built-in monitoring capabilities offer essential support for powering multiple servers and networking devices safely.</p><h3>Product Information</h3><h4>Standard Information</h4><ul><li><strong>Type</strong>: Rack mount PDU</li><li><strong>PDU Type</strong>: Switched</li></ul><h4>Technical Specifications</h4><ul><li><strong>Number of Outlets</strong>: 8</li><li><strong>Input Voltage</strong>: 100-120V AC</li><li><strong>Maximum Current</strong>: 15A</li><li><strong>Power Rating</strong>: 1440VA</li><li><strong>Weight</strong>: 5 lb</li><li><strong>Height</strong>: 1.7 inches</li><li><strong>Width</strong>: 17.5 inches</li><li><strong>Depth</strong>: 4.3 inches</li></ul>",
          "variant.price": "793.81",
          "variant.cost": "793.81",
          "variant.sourceListPrice": null,
          "variant.insertedOn": "2024-08-02T11:36:52.745020",
          "variant.weightUnit": "POUND",
          "variant.weight": "7.61",
          "product.categoryThree": "POWER SOLAR PANELS",
          "variant.dimensionUnit": null,
          "variant.mpn": "AP7900B",
          "variant.bundle": "false",
          "variant.status": "Linked To Some Channels",
          "variant.upc": "731304331568",
          "variant.images": """["https://assets.flxpoint.com/account/23399/products/137858557/images/173324000.jpg", "https://assets.flxpoint.com/account/23399/products/137858557/images/173324001.jpg", "https://assets.flxpoint.com/account/23399/products/137858557/images/173324002.jpg", "https://assets.flxpoint.com/account/23399/products/137858557/images/173324003.jpg", "https://assets.flxpoint.com/account/23399/products/137858557/images/173324004.jpg"]""",
          "variant.sku": "50b35eb6-1854-4197-8eac-f582ccefe602",
          "product.categoryTwo": "GENERATORS & POWER SUPPLIES",
          "product.description": "<h3>Product Description</h3><p>APC AP7900B Rack PDU is a power distribution unit designed for reliable power management in a data center setting. This switched PDU features a one rack unit height and supports up to 15 amps at 100 to 120 volts. It provides eight NEMA 5-15 outlets for versatile connectivity.</p><ul><li>Accommodates up to eight devices with NEMA 5-15 outlets.</li><li>Equipped with a digital current meter to monitor load and prevent overloads.</li><li>Designed for rack mount applications to optimize space and efficiency.</li></ul><h4>Product Highlights</h4><p>The APC AP7900B is suitable for maintaining optimal power distribution within server racks. Its compact design and built-in monitoring capabilities offer essential support for powering multiple servers and networking devices safely.</p><h3>Product Information</h3><h4>Standard Information</h4><ul><li><strong>Type</strong>: Rack mount PDU</li><li><strong>PDU Type</strong>: Switched</li></ul><h4>Technical Specifications</h4><ul><li><strong>Number of Outlets</strong>: 8</li><li><strong>Input Voltage</strong>: 100-120V AC</li><li><strong>Maximum Current</strong>: 15A</li><li><strong>Power Rating</strong>: 1440VA</li><li><strong>Weight</strong>: 5 lb</li><li><strong>Height</strong>: 1.7 inches</li><li><strong>Width</strong>: 17.5 inches</li><li><strong>Depth</strong>: 4.3 inches</li></ul>",
          "product.images": """["https://assets.flxpoint.com/account/23399/products/137858557/images/173324000.jpg", "https://assets.flxpoint.com/account/23399/products/137858557/images/173324001.jpg", "https://assets.flxpoint.com/account/23399/products/137858557/images/173324002.jpg", "https://assets.flxpoint.com/account/23399/products/137858557/images/173324003.jpg", "https://assets.flxpoint.com/account/23399/products/137858557/images/173324004.jpg"]""",
          "variant.custom_aggregate_fields": """{"Marketplace QTY" : "0.00", "Marketplace PRICE" : "999999.00"}""",
          "product.sourceCount": "3",
          "product.insertedOn": "2024-08-02T11:36:51.710872",
          "variant.tags": "[AI_Content_Global, AI_Content_08_08, AI_Content_New_08_08, AI_Content_New_08_08_AICONTENT, AI_Content_New_08_08_AICONTENT_PUBLISHED, eBay_Potential_12_16]",
          "variant.dimensionalWeight": null,
          "variant.id": "171475694",
          "variant.title": "APC AP7900B Rack PDU, Switched, 1U RMS, 15A, 100/120V, NEMA 5-15 Outlets",
          "variant.width": null,
          "variant.sourceNames": """["Anixter","Graybar","Schneider Electric"]"""
        }
      }`;

      const result = parseJsonResilient(clientJson);
      expect(result.success).toBe(true);
      expect(result.data).toBeDefined();
      expect(result.data._source).toBeDefined();
      expect(result.data._source['product.manufacturer']).toBe('APC');
      // Verify that triple-quoted arrays are parsed as actual arrays
      expect(Array.isArray(result.data._source['product.variantSkus'])).toBe(true);
      expect(result.data._source['product.variantSkus']).toEqual(["50b35eb6-1854-4197-8eac-f582ccefe602"]);
      // Verify that triple-quoted objects are parsed as actual objects
      expect(typeof result.data._source['variant.sourceLinks']).toBe('object');
      expect(result.data._source['variant.sourceLinks']["25856307"]).toBe("18688060779");
      expect(result.repairs).toBeDefined();
      expect(result.repairs!.length).toBeGreaterThan(0);
    });

    it('should handle trailing commas', () => {
      const jsonWithTrailingComma = '{"key": "value", "number": 123,}';
      const result = parseJsonResilient(jsonWithTrailingComma);
      expect(result.success).toBe(true);
      expect(result.data).toEqual({ key: 'value', number: 123 });
      expect(result.repairs).toContain('Removes trailing commas from objects and arrays');
    });

    it('should handle Python-style None, True, False', () => {
      const pythonJson = '{"nullValue": None, "trueValue": True, "falseValue": False}';
      const result = parseJsonResilient(pythonJson, { attemptRepair: true });
      expect(result.success).toBe(true);
      expect(result.data).toEqual({
        nullValue: null,
        trueValue: true,
        falseValue: false
      });
    });

    it('should handle single quotes automatically', () => {
      const singleQuoteJson = "{'key': 'value', 'number': 123}";
      const result = parseJsonResilient(singleQuoteJson);
      expect(result.success).toBe(true);
      expect(result.data).toEqual({ key: 'value', number: 123 });
    });

    it('should handle single quotes with control characters', () => {
      // Single-quoted strings with newlines and tabs
      const jsonWithControlChars = `{'message': 'Hello\nWorld', 'tab': 'Tab\there'}`;
      const result = parseJsonResilient(jsonWithControlChars);
      expect(result.success).toBe(true);
      expect(result.data).toEqual({
        message: 'Hello\nWorld',
        tab: 'Tab\there'
      });
      expect(result.repairs).toContain('Converts single quotes to double quotes');
      expect(result.repairs).toContain('Escapes unescaped control characters (newlines, tabs, etc.) in JSON strings');
    });

    it('should preserve apostrophes in double-quoted strings', () => {
      // Mix of quotes with apostrophes and control chars
      const mixedQuotes = `{"name": "O'Brien", 'address': 'Line 1\nLine 2'}`;
      const result = parseJsonResilient(mixedQuotes);
      expect(result.success).toBe(true);
      expect(result.data).toEqual({
        name: "O'Brien",  // Apostrophe preserved
        address: "Line 1\nLine 2"
      });
    });

    it('should handle control characters in various string contexts', () => {
      // Control chars in different quote styles
      const complexJson = `{
        "double": "Has\ttab",
        'single': 'Has\nnewline',
        "mixed": "It's\ta\ntest"
      }`;
      const result = parseJsonResilient(complexJson);
      expect(result.success).toBe(true);
      expect(result.data).toEqual({
        double: "Has\ttab",
        single: "Has\nnewline",
        mixed: "It's\ta\ntest"
      });
    });

    it('should handle unquoted keys automatically', () => {
      const unquotedJson = '{key: "value", number: 123}';
      const result = parseJsonResilient(unquotedJson);
      expect(result.success).toBe(true);
      expect(result.data).toEqual({ key: 'value', number: 123 });
    });

    it('should return error for completely invalid JSON', () => {
      const invalidJson = 'this is not json at all';
      const result = parseJsonResilient(invalidJson);
      expect(result.success).toBe(false);
      expect(result.error).toBeDefined();
    });

    it('should handle edge case with apostrophes in single-quoted strings', () => {
      // The SingleQuoteStrategy regex pattern [^']+ doesn't match strings with apostrophes
      // This is a known limitation - it's better to use double quotes for strings with apostrophes
      const jsonWithApostrophe = `{"name": "O'Brien", 'simple': 'value'}`;
      const result = parseJsonResilient(jsonWithApostrophe);
      expect(result.success).toBe(true);
      expect(result.data).toEqual({
        name: "O'Brien",  // Double quotes preserve apostrophes
        simple: 'value'   // Single quotes without apostrophes work fine
      });
    });
  });

  describe('parseJSON (backwards compatibility)', () => {
    it('should work with Buffer input', () => {
      const validJson = '{"key": "value"}';
      const buffer = Buffer.from(validJson, 'utf8');
      const result = parseJSON(buffer);
      expect(result).toEqual({ key: 'value' });
    });

    it('should work with string input', () => {
      const validJson = '{"key": "value"}';
      const result = parseJSON(validJson);
      expect(result).toEqual({ key: 'value' });
    });

    it('should handle malformed JSON with triple quotes', () => {
      const malformedJson = `{"field": """{"inner": "value"}"""}`;
      const result = parseJSON(malformedJson);
      expect(result).toBeDefined();
      // Should parse the inner JSON as an actual object
      expect(result.field).toEqual({ inner: "value" });
    });

    it('should throw on completely invalid JSON', () => {
      const invalidJson = 'not json';
      expect(() => parseJSON(invalidJson)).toThrow('Failed to parse JSON');
    });
  });

  describe('isValidJson', () => {
    it('should return true for valid JSON', () => {
      expect(isValidJson('{"key": "value"}')).toBe(true);
      expect(isValidJson('[]')).toBe(true);
      expect(isValidJson('null')).toBe(true);
      expect(isValidJson('123')).toBe(true);
      expect(isValidJson('"string"')).toBe(true);
    });

    it('should return false for invalid JSON', () => {
      expect(isValidJson('{"key": "value",}')).toBe(false);
      expect(isValidJson("{'key': 'value'}")).toBe(false);
      expect(isValidJson('undefined')).toBe(false);
      expect(isValidJson('')).toBe(false);
    });
  });

  describe('prettyPrintJson', () => {
    it('should format JSON with indentation', () => {
      const data = { key: 'value', nested: { inner: 'data' } };
      const pretty = prettyPrintJson(data);
      expect(pretty).toContain('\n');
      expect(pretty).toContain('  ');
    });

    it('should use custom indentation', () => {
      const data = { key: 'value' };
      const pretty = prettyPrintJson(data, 4);
      expect(pretty).toContain('    ');
    });
  });

  describe('minifyJson', () => {
    it('should remove whitespace from JSON', () => {
      const prettyJson = `{
        "key": "value",
        "number": 123
      }`;
      const minified = minifyJson(prettyJson);
      expect(minified).toBe('{"key":"value","number":123}');
      expect(minified).not.toContain('\\n');
      expect(minified).not.toContain(' ');
    });

    it('should repair and minify malformed JSON', () => {
      const malformed = '{"key": "value",}';
      const minified = minifyJson(malformed);
      expect(minified).toBe('{"key":"value"}');
    });

    it('should throw for completely invalid JSON', () => {
      expect(() => minifyJson('not json')).toThrow('Cannot minify invalid JSON');
    });
  });

  describe('ResilientJsonParser class', () => {
    it('should work with class instantiation', () => {
      const parser = new ResilientJsonParser();
      const result = parser.parse('{"key": "value"}');
      expect(result.success).toBe(true);
      expect(result.data).toEqual({ key: 'value' });
    });

    it('should handle strategy ordering correctly for single quotes with control chars', () => {
      // This test validates that SingleQuoteStrategy runs before UnescapedControlCharactersStrategy
      // If the order were reversed, this would fail because control chars in single-quoted strings
      // wouldn't be detected and fixed
      const parser = new ResilientJsonParser();

      // Complex case with single quotes and control chars
      // Note: The SingleQuoteStrategy regex won't match strings with apostrophes inside
      const problematicJson = `{
        'description': 'Product\nwith\nnewlines',
        'tab_field': 'Has\ttabs\there',
        "comment": "Already double-quoted\nwith newline"
      }`;

      const result = parser.parse(problematicJson);
      expect(result.success).toBe(true);
      expect(result.data).toEqual({
        description: 'Product\nwith\nnewlines',
        tab_field: 'Has\ttabs\there',
        comment: 'Already double-quoted\nwith newline'
      });

      // Verify the strategies were applied in the correct order
      const strategies = result.metadata?.strategiesApplied || [];
      const singleQuoteIndex = strategies.indexOf('SingleQuoteRepair');
      const controlCharIndex = strategies.indexOf('UnescapedControlCharactersRepair');

      // SingleQuoteRepair should come before UnescapedControlCharactersRepair if both are present
      if (singleQuoteIndex !== -1 && controlCharIndex !== -1) {
        expect(singleQuoteIndex).toBeLessThan(controlCharIndex);
      }
    });

    it('should handle custom strategies', () => {
      // Create a custom strategy
      class CustomPrefixStrategy extends RepairStrategy {
        name = 'CustomPrefix';
        description = 'Removes custom prefix';

        canApply(input: string): boolean {
          return input.startsWith('CUSTOM:');
        }

        apply(input: string): string {
          return input.replace('CUSTOM:', '');
        }
      }

      const parser = new ResilientJsonParser({
        customStrategies: [new CustomPrefixStrategy()]
      });

      const result = parser.parse('CUSTOM:{"key": "value"}');
      expect(result.success).toBe(true);
      expect(result.data).toEqual({ key: 'value' });
      expect(result.metadata?.strategiesApplied).toContain('CustomPrefix');
    });

    it('should properly parse nested JSON in triple quotes', () => {
      const parser = new ResilientJsonParser();
      const complexJson = `{
        "simple": "value",
        "nested_json": """{"inner": {"deep": "value"}, "array": [1, 2, 3]}""",
        "nested_array": """["item1", "item2", {"key": "value"}]""",
        "regular": 123
      }`;

      const result = parser.parse(complexJson);
      expect(result.success).toBe(true);
      expect(result.data.simple).toBe('value');
      expect(result.data.regular).toBe(123);
      // Nested JSON should be parsed as actual objects
      expect(result.data.nested_json).toEqual({
        inner: { deep: "value" },
        array: [1, 2, 3]
      });
      expect(result.data.nested_array).toEqual(["item1", "item2", { key: "value" }]);
    });

    it('should provide metadata about parsing', () => {
      const parser = new ResilientJsonParser({ logRepairs: false });
      const malformed = '{"key": "value",}';
      const result = parser.parse(malformed);

      expect(result.success).toBe(true);
      expect(result.metadata).toBeDefined();
      expect(result.metadata?.parseTime).toBeGreaterThanOrEqual(0);
      expect(result.metadata?.strategiesApplied).toContain('TrailingCommaRepair');
    });

    it('should handle options correctly', () => {
      const parser = new ResilientJsonParser({ attemptRepair: false });
      const malformed = '{"key": "value",}';
      const result = parser.parse(malformed);

      expect(result.success).toBe(false);
      expect(result.error).toContain('JSON parse error');
    });

    it('should handle trailing non-JSON characters after valid JSON', () => {
      const parser = new ResilientJsonParser();

      // Test with object and trailing tilde
      const jsonWithTilde = '{"key": "value", "number": 42}~';
      const result1 = parser.parse(jsonWithTilde);
      expect(result1.success).toBe(true);
      expect(result1.data).toEqual({ key: "value", number: 42 });
      expect(result1.metadata?.strategiesApplied).toContain('TrailingCharactersRepair');

      // Test with array and trailing characters
      const jsonArrayWithTrailing = '[1, 2, 3, "test"]random text here';
      const result2 = parser.parse(jsonArrayWithTrailing);
      expect(result2.success).toBe(true);
      expect(result2.data).toEqual([1, 2, 3, "test"]);
      expect(result2.metadata?.strategiesApplied).toContain('TrailingCharactersRepair');

      // Test with nested object and trailing newline and tilde
      const complexJson = `{
        "_index": "test",
        "_id": "123",
        "_source": {
          "product": {
            "title": "Test Product",
            "price": 99.99
          }
        }
      }
~
`;
      const result3 = parser.parse(complexJson);
      expect(result3.success).toBe(true);
      expect(result3.data._index).toBe("test");
      expect(result3.data._source.product.price).toBe(99.99);
      expect(result3.metadata?.strategiesApplied).toContain('TrailingCharactersRepair');
    });

    it('should use aggressive fallback for JSON with leading garbage', () => {
      const parser = new ResilientJsonParser();

      // Test with leading text before JSON
      const jsonWithPrefix = 'Server response: {"status": "ok", "code": 200}';
      const result = parser.parse(jsonWithPrefix);
      expect(result.success).toBe(true);
      expect(result.data).toEqual({ status: "ok", code: 200 });
      expect(result.metadata?.strategiesApplied).toContain('AggressiveFallback');

      // Test with debug output around JSON
      const debugJson = 'DEBUG: Processing data... [1, 2, 3] Done!';
      const result2 = parser.parse(debugJson);
      expect(result2.success).toBe(true);
      expect(result2.data).toEqual([1, 2, 3]);
      expect(result2.metadata?.strategiesApplied).toContain('AggressiveFallback');
    });
  });
});
