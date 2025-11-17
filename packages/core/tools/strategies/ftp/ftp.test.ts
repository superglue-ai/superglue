import { describe, expect, it } from 'vitest';
import { parseConnectionUrl } from './ftp.js';

describe('FTP URL Parsing', () => {
  describe('parseConnectionUrl', () => {
    it('should parse basic FTP URL', () => {
      const result = parseConnectionUrl('ftp://user:pass@host.com');
      
      expect(result.protocol).toBe('ftp');
      expect(result.host).toBe('host.com');
      expect(result.port).toBe(21);
      expect(result.username).toBe('user');
      expect(result.password).toBe('pass');
      expect(result.basePath).toBeUndefined();
    });

    it('should parse SFTP URL', () => {
      const result = parseConnectionUrl('sftp://user:pass@host.com');
      
      expect(result.protocol).toBe('sftp');
      expect(result.host).toBe('host.com');
      expect(result.port).toBe(22);
      expect(result.username).toBe('user');
      expect(result.password).toBe('pass');
    });

    it('should parse FTPS URL', () => {
      const result = parseConnectionUrl('ftps://user:pass@host.com');
      
      expect(result.protocol).toBe('ftps');
      expect(result.host).toBe('host.com');
      expect(result.port).toBe(21);
    });

    it('should parse URL with custom port', () => {
      const result = parseConnectionUrl('ftp://user:pass@host.com:2121');
      
      expect(result.port).toBe(2121);
    });

    it('should parse URL with base path', () => {
      const result = parseConnectionUrl('ftp://user:pass@host.com/data/files');
      
      expect(result.basePath).toBe('/data/files');
    });

    it('should handle URL without password', () => {
      const result = parseConnectionUrl('ftp://user@host.com');
      
      expect(result.username).toBe('user');
      expect(result.password).toBeUndefined();
    });

    it('should handle @ symbol in password', () => {
      const result = parseConnectionUrl('sftp://user:p@ssw0rd@host.com');
      
      expect(result.username).toBe('user');
      expect(result.password).toBe('p@ssw0rd');
    });

    it('should handle multiple @ symbols in password', () => {
      const result = parseConnectionUrl('sftp://user:p@ss@w0rd@host.com');
      
      expect(result.username).toBe('user');
      expect(result.password).toBe('p@ss@w0rd');
    });

    it('should handle @ symbol in username', () => {
      const result = parseConnectionUrl('sftp://us@er:password@host.com');
      
      expect(result.username).toBe('us@er');
      expect(result.password).toBe('password');
    });

    it('should handle special characters in password', () => {
      const result = parseConnectionUrl('sftp://user:p@$$w0rd!@host.com');
      
      expect(result.username).toBe('user');
      expect(result.password).toBe('p@$$w0rd!');
    });

    it('should handle colon in password', () => {
      const result = parseConnectionUrl('sftp://user:pass:word@host.com');
      
      expect(result.username).toBe('user');
      expect(result.password).toBe('pass:word');
    });

    it('should handle multiple special characters', () => {
      const result = parseConnectionUrl('sftp://admin:P@ss:W0rd!@#$@192.168.1.100:2222/home/data');
      
      expect(result.protocol).toBe('sftp');
      expect(result.host).toBe('192.168.1.100');
      expect(result.port).toBe(2222);
      expect(result.username).toBe('admin');
      expect(result.password).toBe('P@ss:W0rd!@#$');
      expect(result.basePath).toBe('/home/data');
    });

    it('should handle URL-encoded characters that are already encoded', () => {
      const result = parseConnectionUrl('ftp://user:pass%40word@host.com');
      
      expect(result.username).toBe('user');
      expect(result.password).toBe('pass@word');
    });

    it('should handle spaces in credentials (encoded)', () => {
      const result = parseConnectionUrl('sftp://user:pass%20word@host.com');
      
      expect(result.username).toBe('user');
      expect(result.password).toBe('pass word');
    });

    it('should parse invalid protocol (http) as ftp-like URL', () => {
      const result = parseConnectionUrl('http://user:pass@host.com');
      
      expect(result.protocol).toBe('http');
      expect(result.username).toBe('user');
      expect(result.password).toBe('pass');
    });

    it('should throw error for malformed URL without credentials', () => {
      expect(() => parseConnectionUrl('ftp://host.com:invalid')).toThrow();
    });

    it('should handle real-world complex password scenario', () => {
      const result = parseConnectionUrl('sftp://deploy-user:Tr0ub!3$0m3@p@ssw0rd:2024@sftp.example.com:2222/var/www/uploads');
      
      expect(result.protocol).toBe('sftp');
      expect(result.host).toBe('sftp.example.com');
      expect(result.port).toBe(2222);
      expect(result.username).toBe('deploy-user');
      expect(result.password).toBe('Tr0ub!3$0m3@p@ssw0rd:2024');
      expect(result.basePath).toBe('/var/www/uploads');
    });

    it('should handle IPv6 addresses', () => {
      const result = parseConnectionUrl('ftp://user:pass@[::1]:2121');
      
      expect(result.host).toBe('[::1]');
      expect(result.port).toBe(2121);
    });

    it('should handle empty password', () => {
      const result = parseConnectionUrl('ftp://user:@host.com');
      
      expect(result.username).toBe('user');
      expect(result.password).toBeUndefined();
    });

    it('should preserve case sensitivity in credentials', () => {
      const result = parseConnectionUrl('sftp://UserName:PaSsWoRd@host.com');
      
      expect(result.username).toBe('UserName');
      expect(result.password).toBe('PaSsWoRd');
    });
  });
});

