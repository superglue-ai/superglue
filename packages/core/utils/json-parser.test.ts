import { describe, expect, it } from 'vitest';
import {
  isValidJson,
  minifyJson,
  parseJSON,
  parseJsonResilient,
  prettyPrintJson,
  RepairStrategy,
  ResilientJsonParser
} from './json-parser.js';

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
      expect(isValidJson("{'key': 'value'}"  )).toBe(false);
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
  });
});