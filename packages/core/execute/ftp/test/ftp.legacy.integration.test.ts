import { ApiConfig, HttpMethod, RequestOptions } from '@superglue/client';
import { beforeAll, describe, expect, it } from 'vitest';
import { callFTP } from '../ftp.legacy.js';

describe('FTP File Extraction', () => {
  const ftpConfig: ApiConfig = {
    id: 'ftp-test',
    instruction: 'Test FTP server',
    urlHost: 'ftp://testuser:testpass@127.0.0.1:2121',
    urlPath: '/',
    method: HttpMethod.POST,
    body: ''
  };

  const requestOptions: RequestOptions = {
    timeout: 10000,
    retries: 1
  };

  beforeAll(async () => {
    console.log('Testing FTP server at ftp://127.0.0.1:2121');
  });

  describe('list operation', () => {
    it('should list files in FTP directory', async () => {
      const config: ApiConfig = {
        ...ftpConfig,
        body: JSON.stringify({
          operation: 'list',
          path: '/'
        })
      };

      const result = await callFTP({
        endpoint: config,
        credentials: {},
        options: requestOptions
      });

      expect(result).toBeDefined();
      expect(Array.isArray(result)).toBe(true);
      expect(result.length).toBeGreaterThan(0);

      const fileNames = result.map((f: any) => f.name);
      expect(fileNames).toContain('customers.csv');
      expect(fileNames).toContain('products.xml');
      expect(fileNames).toContain('orders.json');
      expect(fileNames).toContain('test.txt');

      const csvFile = result.find((f: any) => f.name === 'customers.csv');
      expect(csvFile).toBeDefined();
      expect(csvFile.type).toBe('file');
      expect(csvFile.size).toBeGreaterThan(0);
      expect(csvFile.path).toBe('/customers.csv');
    });
  });

  describe('get operation - CSV', () => {
    it('should download and parse CSV file correctly', async () => {
      const config: ApiConfig = {
        ...ftpConfig,
        body: JSON.stringify({
          operation: 'get',
          path: '/customers.csv'
        })
      };

      const result = await callFTP({
        endpoint: config,
        credentials: {},
        options: requestOptions
      });

      expect(result).toBeDefined();
      expect(Array.isArray(result)).toBe(true);
      expect(result.length).toBe(10);

      const firstCustomer = result[0];
      expect(firstCustomer.id).toBe('1');
      expect(firstCustomer.name).toBe('John Smith');
      expect(firstCustomer.email).toBe('john.smith@example.com');
      expect(firstCustomer.country).toBe('USA');
      expect(firstCustomer.status).toBe('active');

      const ukCustomer = result.find((c: any) => c.country === 'UK');
      expect(ukCustomer).toBeDefined();
      expect(ukCustomer.name).toBe('Michael Brown');
      expect(ukCustomer.status).toBe('inactive');

      const frenchCustomer = result.find((c: any) => c.country === 'France');
      expect(frenchCustomer).toBeDefined();
      expect(frenchCustomer.name).toBe('Sophie Martin');
      expect(frenchCustomer.status).toBe('active');
    });
  });

  describe('get operation - XML', () => {
    it('should download and parse XML file correctly', async () => {
      const config: ApiConfig = {
        ...ftpConfig,
        body: JSON.stringify({
          operation: 'get',
          path: '/products.xml'
        })
      };

      const result = await callFTP({
        endpoint: config,
        credentials: {},
        options: requestOptions
      });

      expect(result).toBeDefined();
      expect(result.PRODUCTS).toBeDefined();
      expect(result.PRODUCTS.PRODUCT).toBeDefined();
      expect(Array.isArray(result.PRODUCTS.PRODUCT)).toBe(true);
      expect(result.PRODUCTS.PRODUCT.length).toBe(8);

      const firstProduct = result.PRODUCTS.PRODUCT[0];
      expect(firstProduct.ID).toBe('P001');
      expect(firstProduct.NAME).toBe('Wireless Mouse');
      expect(firstProduct.CATEGORY).toBe('Electronics');
      expect(firstProduct.PRICE._TEXT).toBe('29.99');
      expect(firstProduct.PRICE.CURRENCY).toBe('USD');
      expect(firstProduct.STOCK).toBe('150');
      expect(firstProduct.STATUS).toBe('available');

      expect(firstProduct.ATTRIBUTES).toBeDefined();
      expect(firstProduct.ATTRIBUTES.COLOR).toBe('Black');
      expect(firstProduct.ATTRIBUTES.BRAND).toBe('TechPro');

      const keyboardProduct = result.PRODUCTS.PRODUCT.find(
        (p: any) => p.ID === 'P003'
      );
      expect(keyboardProduct).toBeDefined();
      expect(keyboardProduct.NAME).toBe('Mechanical Keyboard');
      expect(keyboardProduct.PRICE._TEXT).toBe('89.99');
      expect(keyboardProduct.ATTRIBUTES.SWITCH_TYPE).toBe('Cherry MX Blue');

      const outOfStockProduct = result.PRODUCTS.PRODUCT.find(
        (p: any) => p.STATUS === 'out_of_stock'
      );
      expect(outOfStockProduct).toBeDefined();
      expect(outOfStockProduct.ID).toBe('P006');
      expect(outOfStockProduct.NAME).toBe('Webcam HD');
      expect(outOfStockProduct.STOCK).toBe('0');
    });
  });

  describe('get operation - JSON', () => {
    it('should download and parse JSON file correctly', async () => {
      const config: ApiConfig = {
        ...ftpConfig,
        body: JSON.stringify({
          operation: 'get',
          path: '/orders.json'
        })
      };

      const result = await callFTP({
        endpoint: config,
        credentials: {},
        options: requestOptions
      });

      expect(result).toBeDefined();
      expect(result.orders).toBeDefined();
      expect(Array.isArray(result.orders)).toBe(true);
      expect(result.orders.length).toBe(5);

      const firstOrder = result.orders[0];
      expect(firstOrder.order_id).toBe('ORD-2024-001');
      expect(firstOrder.customer_id).toBe(1);
      expect(firstOrder.customer_name).toBe('John Smith');
      expect(firstOrder.status).toBe('shipped');
      expect(firstOrder.total).toBe(149.97);

      expect(firstOrder.items).toBeDefined();
      expect(Array.isArray(firstOrder.items)).toBe(true);
      expect(firstOrder.items.length).toBe(3);

      const firstItem = firstOrder.items[0];
      expect(firstItem.product_id).toBe('P001');
      expect(firstItem.product_name).toBe('Wireless Mouse');
      expect(firstItem.quantity).toBe(2);
      expect(firstItem.price).toBe(29.99);

      expect(firstOrder.shipping).toBeDefined();
      expect(firstOrder.shipping.tracking).toBe('1Z999AA10123456784');

      const processingOrder = result.orders.find(
        (o: any) => o.status === 'processing'
      );
      expect(processingOrder).toBeDefined();
      expect(processingOrder.order_id).toBe('ORD-2024-002');
      expect(processingOrder.customer_name).toBe('Sophie Martin');

      expect(result.summary).toBeDefined();
      expect(result.summary.total_orders).toBe(5);
      expect(result.summary.total_revenue).toBe(997.88);
      expect(result.summary.status_breakdown).toBeDefined();
      expect(result.summary.status_breakdown.pending).toBe(1);
      expect(result.summary.status_breakdown.shipped).toBe(2);
    });
  });

  describe('get operation - Text', () => {
    it('should download text file correctly', async () => {
      const config: ApiConfig = {
        ...ftpConfig,
        body: JSON.stringify({
          operation: 'get',
          path: '/test.txt'
        })
      };

      const result = await callFTP({
        endpoint: config,
        credentials: {},
        options: requestOptions
      });

      expect(result).toBeDefined();
      expect(typeof result).toBe('string');
      expect(result).toContain('Hello from FTP server!');
      expect(result).toContain('This is a test file.');
    });
  });

  describe('exists operation', () => {
    it('should check if file exists', async () => {
      const config: ApiConfig = {
        ...ftpConfig,
        body: JSON.stringify({
          operation: 'exists',
          path: '/customers.csv'
        })
      };

      const result = await callFTP({
        endpoint: config,
        credentials: {},
        options: requestOptions
      });

      expect(result).toBeDefined();
      expect(result.exists).toBe(true);
      expect(result.path).toBe('/customers.csv');
    });

    it('should return false for non-existent file', async () => {
      const config: ApiConfig = {
        ...ftpConfig,
        body: JSON.stringify({
          operation: 'exists',
          path: '/nonexistent.txt'
        })
      };

      const result = await callFTP({
        endpoint: config,
        credentials: {},
        options: requestOptions
      });

      expect(result).toBeDefined();
      expect(result.exists).toBe(false);
      expect(result.path).toBe('/nonexistent.txt');
    });
  });

  describe('stat operation', () => {
    it('should get file metadata', async () => {
      const config: ApiConfig = {
        ...ftpConfig,
        body: JSON.stringify({
          operation: 'stat',
          path: '/products.xml'
        })
      };

      const result = await callFTP({
        endpoint: config,
        credentials: {},
        options: requestOptions
      });

      expect(result).toBeDefined();
      expect(result.exists).toBe(true);
      expect(result.name).toBe('products.xml');
      expect(result.size).toBeGreaterThan(0);
      expect(result.type).toBe('file');
      expect(result.path).toBe('/products.xml');
    });
  });

  describe('error handling', () => {
    it('should handle invalid operation', async () => {
      const config: ApiConfig = {
        ...ftpConfig,
        body: JSON.stringify({
          operation: 'invalid',
          path: '/'
        })
      };

      await expect(
        callFTP({
          endpoint: config,
          credentials: {},
          options: requestOptions
        })
      ).rejects.toThrow();
    });

    it('should handle missing path for get operation', async () => {
      const config: ApiConfig = {
        ...ftpConfig,
        body: JSON.stringify({
          operation: 'get'
        })
      };

      await expect(
        callFTP({
          endpoint: config,
          credentials: {},
          options: requestOptions
        })
      ).rejects.toThrow('path required for get operation');
    });

    it('should handle non-existent file for get operation', async () => {
      const config: ApiConfig = {
        ...ftpConfig,
        body: JSON.stringify({
          operation: 'get',
          path: '/nonexistent.csv'
        })
      };

      await expect(
        callFTP({
          endpoint: config,
          credentials: {},
          options: requestOptions
        })
      ).rejects.toThrow();
    });
  });
});

