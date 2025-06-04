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
}); 