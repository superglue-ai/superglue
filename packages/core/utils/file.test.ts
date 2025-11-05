import axios from 'axios';
import { describe, expect, it } from 'vitest';
import { parseFile } from '../files/index.js';
import { parseZIP } from '../files/parsers/zip.js';

describe('File Utilities', () => {
  describe('parseFile', () => {
    it('should parse JSON data', async () => {
      const jsonData = JSON.stringify([{ name: 'test', value: 123 }]);
      const buffer = Buffer.from(jsonData);

      const result = await parseFile(buffer, 'JSON');
      expect(result).toEqual([{ name: 'test', value: 123 }]);
    });

    it('should parse CSV data', async () => {
      const csvData = 'name,value\ntest,123';
      const buffer = Buffer.from(csvData);

      const result = await parseFile(buffer, 'CSV');
      expect(result).toEqual([{ name: 'test', value: '123' }]);
    });

    it('should parse CSV data as array if multiple rows are given', async () => {
      const csvData = 'name,value\ntest,123\ntest2,456';
      const buffer = Buffer.from(csvData);

      const result = await parseFile(buffer, 'CSV');
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

      const result = await parseFile(buffer, 'XML');
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

      const result = await parseFile(buffer, 'XML');
      expect(result?.ROOT?.ITEM).toHaveLength(2);
      expect(result?.ROOT?.ITEM).toEqual([
        { NAME: 'test', VALUE: '123' },
        { NAME: 'test2', VALUE: '456' }
      ]);
    });

    it('should throw error for unsupported file type', async () => {
      const buffer = Buffer.from('test data');
      await expect(parseFile(buffer, 'INVALID'))
        .rejects.toThrow('Unsupported file type');
    });
  });

  describe('parseZIP', () => {
    it('should extract all files from zip archive', async () => {
      const file = await axios.get('https://sample-files.com/downloads/compressed/zip/basic-text.zip', { responseType: 'arraybuffer' });

      const result = await parseZIP(Buffer.from(file.data));
      expect(Object.keys(result).length).toBeGreaterThan(0);
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
}); 