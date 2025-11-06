import { FileType } from '@superglue/client';
import axios from 'axios';
import { describe, expect, it } from 'vitest';
import { decompressZip, parseFile } from './file.js';

describe('File Utilities', () => {
  describe('parseFile', () => {
    it('should parse JSON data', async () => {
      const jsonData = JSON.stringify([{ name: 'test', value: 123 }]);
      const buffer = Buffer.from(jsonData);

      const result = await parseFile(buffer, FileType.JSON);
      expect(result).toEqual([{ name: 'test', value: 123 }]);
    });

    it('should parse CSV data', async () => {
      const csvData = 'name,value\ntest,123';
      const buffer = Buffer.from(csvData);

      const result = await parseFile(buffer, FileType.CSV);
      expect(result).toEqual([{ name: 'test', value: '123' }]);
    });

    it('should parse CSV data as array if multiple rows are given', async () => {
      const csvData = 'name,value\ntest,123\ntest2,456';
      const buffer = Buffer.from(csvData);

      const result = await parseFile(buffer, FileType.CSV);
      expect(result).toEqual([
        { name: 'test', value: '123' },
        { name: 'test2', value: '456' }
      ]);
    });
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

      const result = await parseFile(buffer, FileType.XML);
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

      const result = await parseFile(buffer, FileType.XML);
      expect(result?.ROOT?.ITEM).toHaveLength(2);
      expect(result?.ROOT?.ITEM).toEqual([
        { NAME: 'test', VALUE: '123' },
        { NAME: 'test2', VALUE: '456' }
      ]);
    });

    it('should throw error for unsupported file type', async () => {
      const buffer = Buffer.from('test data');
      await expect(parseFile(buffer, 'INVALID' as FileType))
        .rejects.toThrow('Unsupported file type');
    });
  });

  describe('decompressZip', () => {
    it('should extract first file from zip archive', async () => {
      // This is a minimal valid ZIP file structure containing one file named "test.txt" with content "Hello World!"
      const file = await axios.get('https://sample-files.com/downloads/compressed/zip/basic-text.zip', { responseType: 'arraybuffer' });

      const result = await decompressZip(file.data);
      expect(result.toString()).toBe('This is a sample file.');
    });

    it('should throw error when zip is empty or invalid', async () => {
      // Test with completely empty buffer
      const emptyBuffer = Buffer.from([]);
      await expect(decompressZip(emptyBuffer))
        .rejects.toThrow('Error decompressing zip');

      // Test with invalid ZIP (just the ZIP end of central directory marker)
      const invalidZip = Buffer.from([
        0x50, 0x4B, 0x05, 0x06, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00,
        0x00, 0x00, 0x00, 0x00, 0x00, 0x00
      ]);

      await expect(decompressZip(invalidZip))
        .rejects.toThrow('Error decompressing zip');
    });
  });

  describe('File Type Detection (AUTO)', () => {
    describe('JSON Detection', () => {
      it('should detect JSON object', async () => {
        const buffer = Buffer.from('{"name": "test", "value": 123}');
        const result = await parseFile(buffer, FileType.AUTO);
        expect(result).toEqual({ name: 'test', value: 123 });
      });

      it('should detect JSON array', async () => {
        const buffer = Buffer.from('[{"name": "test"}, {"name": "test2"}]');
        const result = await parseFile(buffer, FileType.AUTO);
        expect(result).toEqual([{ name: 'test' }, { name: 'test2' }]);
      });

      it('should detect JSON with leading whitespace', async () => {
        const buffer = Buffer.from('  \n  {"name": "test"}');
        const result = await parseFile(buffer, FileType.AUTO);
        expect(result).toEqual({ name: 'test' });
      });
    });

    describe('XML Detection', () => {
      it('should detect XML with declaration', async () => {
        const xmlData = `<?xml version="1.0"?>
          <root>
            <item>test</item>
          </root>`;
        const buffer = Buffer.from(xmlData);
        const result = await parseFile(buffer, FileType.AUTO);
        expect(result?.ROOT?.ITEM).toBe('test');
      });

      it('should detect XML without declaration', async () => {
        const xmlData = `<root>
          <item>test</item>
        </root>`;
        const buffer = Buffer.from(xmlData);
        const result = await parseFile(buffer, FileType.AUTO);
        expect(result?.ROOT?.ITEM).toBe('test');
      });

      it('should detect XML with leading whitespace', async () => {
        const xmlData = `  
          <?xml version="1.0"?>
          <root><item>test</item></root>`;
        const buffer = Buffer.from(xmlData);
        const result = await parseFile(buffer, FileType.AUTO);
        expect(result?.ROOT?.ITEM).toBe('test');
      });
    });

    describe('HTML Detection', () => {
      it('should detect HTML with DOCTYPE', async () => {
        const htmlData = `<!DOCTYPE html>
          <html>
            <head><title>Test</title></head>
            <body><div id="main">Hello</div></body>
          </html>`;
        const buffer = Buffer.from(htmlData);
        const result = await parseFile(buffer, FileType.AUTO);
        expect(result).toHaveProperty('html');
      });

      it('should detect HTML with lowercase DOCTYPE', async () => {
        const htmlData = `<!doctype html>
          <html>
            <body>Hello</body>
          </html>`;
        const buffer = Buffer.from(htmlData);
        const result = await parseFile(buffer, FileType.AUTO);
        expect(result).toHaveProperty('html');
      });

      it('should detect HTML starting with <html>', async () => {
        const htmlData = `<html>
          <body><p>Test</p></body>
        </html>`;
        const buffer = Buffer.from(htmlData);
        const result = await parseFile(buffer, FileType.AUTO);
        expect(result).toHaveProperty('html');
      });

      it('should detect HTML with <html> tag in content', async () => {
        const htmlData = `  <html lang="en">
          <head><title>Test</title></head>
        </html>`;
        const buffer = Buffer.from(htmlData);
        const result = await parseFile(buffer, FileType.AUTO);
        expect(result).toHaveProperty('html');
      });

      it('should not confuse XML with HTML', async () => {
        const xmlData = `<root>
          <data>test</data>
        </root>`;
        const buffer = Buffer.from(xmlData);
        const result = await parseFile(buffer, FileType.AUTO);
        expect(result).toHaveProperty('ROOT');
        expect(result).not.toHaveProperty('html');
      });
    });

    describe('CSV Detection', () => {
      it('should detect CSV with comma delimiter', async () => {
        const csvData = `name,age,city
John,30,NYC
Jane,25,LA`;
        const buffer = Buffer.from(csvData);
        const result = await parseFile(buffer, FileType.AUTO);
        expect(result).toHaveLength(2);
        expect(result[0]).toEqual({ name: 'John', age: '30', city: 'NYC' });
      });

      it('should detect CSV with semicolon delimiter', async () => {
        const csvData = `name;age;city
John;30;NYC
Jane;25;LA`;
        const buffer = Buffer.from(csvData);
        const result = await parseFile(buffer, FileType.AUTO);
        expect(result).toHaveLength(2);
        expect(result[0]).toEqual({ name: 'John', age: '30', city: 'NYC' });
      });

      it('should detect CSV with tab delimiter', async () => {
        const csvData = `name\tage\tcity
John\t30\tNYC
Jane\t25\tLA`;
        const buffer = Buffer.from(csvData);
        const result = await parseFile(buffer, FileType.AUTO);
        expect(result).toHaveLength(2);
        expect(result[0]).toEqual({ name: 'John', age: '30', city: 'NYC' });
      });

      it('should detect CSV with pipe delimiter', async () => {
        const csvData = `name|age|city
John|30|NYC
Jane|25|LA`;
        const buffer = Buffer.from(csvData);
        const result = await parseFile(buffer, FileType.AUTO);
        expect(result).toHaveLength(2);
        expect(result[0]).toEqual({ name: 'John', age: '30', city: 'NYC' });
      });
    });

    describe('RAW Detection (Fallback)', () => {
      it('should fallback to RAW for plain text', async () => {
        const buffer = Buffer.from('This is just plain text without structure');
        const result = await parseFile(buffer, FileType.AUTO);
        expect(result).toBe('This is just plain text without structure');
      });

      it('should fallback to RAW for unstructured data', async () => {
        const buffer = Buffer.from('Random data\nNo clear format\nJust text');
        const result = await parseFile(buffer, FileType.AUTO);
        expect(result).toBe('Random data\nNo clear format\nJust text');
      });
    });

    describe('Edge Cases', () => {
      it('should handle empty buffer', async () => {
        const buffer = Buffer.from('');
        const result = await parseFile(buffer, FileType.AUTO);
        expect(result).toBeNull();
      });

      it('should handle whitespace-only content as RAW', async () => {
        const buffer = Buffer.from('   \n\n   \t   ');
        const result = await parseFile(buffer, FileType.AUTO);
        expect(result).toBe('   \n\n   \t   ');
      });
    });
  });
}); 