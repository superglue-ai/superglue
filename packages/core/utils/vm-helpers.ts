import ivm from 'isolated-vm';

/**
 * Inject individual helper functions using context.global.set
 * This is the most reliable method for isolated-vm
 */
export async function injectVMHelpersIndividually(context: ivm.Context): Promise<void> {
  // Use evalSync to inject all helpers at once
  // The code will run in the context and create global functions
  context.evalSync(`
    // Base64 encoding
    btoa = function(str) {
      if (!str) return '';
      
      const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
      let binary = '';
      
      // Convert string to binary
      for (let i = 0; i < str.length; i++) {
        const code = str.charCodeAt(i);
        if (code > 255) {
          throw new Error('btoa failed: The string to be encoded contains characters outside of the Latin1 range.');
        }
        binary += code.toString(2).padStart(8, '0');
      }
      
      // Pad binary to make it divisible by 6
      while (binary.length % 6 !== 0) {
        binary += '0';
      }
      
      let result = '';
      
      // Convert 6-bit chunks to base64 characters
      for (let i = 0; i < binary.length; i += 6) {
        const chunk = binary.substr(i, 6);
        const index = parseInt(chunk, 2);
        result += chars[index];
      }
      
      // Add padding
      while (result.length % 4 !== 0) {
        result += '=';
      }
      
      return result;
    };
    
    // Base64 decoding
    atob = function(str) {
      if (!str) return '';
      str = str.replace(/-/g, '+').replace(/_/g, '/');
      
      const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
      str = str.replace(/=+$/, '');
      
      let binary = '';
      for (let i = 0; i < str.length; i++) {
        const index = chars.indexOf(str[i]);
        if (index === -1) continue;
        binary += index.toString(2).padStart(6, '0');
      }
      
      const bytes = [];
      for (let i = 0; i < binary.length; i += 8) {
        if (i + 8 <= binary.length) {
          bytes.push(parseInt(binary.substr(i, 8), 2));
        }
      }
      
      let result = '';
      for (let i = 0; i < bytes.length; i++) {
        result += String.fromCharCode(bytes[i]);
      }
      
      return result;
    };
    
    // escape function - encode each byte of UTF-8
    escape = function(str) {
      let result = '';
      for (let i = 0; i < str.length; i++) {
        const char = str[i];
        const code = char.charCodeAt(0);
        
        if (code < 128) {
          // ASCII characters - don't encode safe characters including !
          if (/[A-Za-z0-9_.~!*'()-]/.test(char)) {
            result += char;
          } else {
            result += '%' + code.toString(16).toUpperCase().padStart(2, '0');
          }
        } else {
          // For UTF-8 multi-byte sequences, we need to encode each byte
          // This is a simplified approach - just encode the raw char code
          result += '%' + ((code >> 8) & 0xFF).toString(16).toUpperCase().padStart(2, '0');
          result += '%' + (code & 0xFF).toString(16).toUpperCase().padStart(2, '0');
        }
      }
      return result;
    };
    
    // decodeURIComponent function
    decodeURIComponent = function(str) {
      return str.replace(/%([0-9A-F]{2})/gi, function(match, p1) {
        return String.fromCharCode(parseInt(p1, 16));
      });
    };
    
    // Buffer object
    Buffer = {
      from: function(str, encoding) {
        if (encoding === 'base64') {
          return {
            toString: function(enc) {
              if (enc === 'utf-8' || enc === 'utf8') {
                const decoded = atob(str);
                // Proper UTF-8 decoding
                const bytes = [];
                for (let i = 0; i < decoded.length; i++) {
                  bytes.push(decoded.charCodeAt(i));
                }
                
                let result = '';
                let i = 0;
                while (i < bytes.length) {
                  const byte1 = bytes[i];
                  
                  if (byte1 < 0x80) {
                    // 1-byte sequence (ASCII)
                    result += String.fromCharCode(byte1);
                    i++;
                  } else if ((byte1 & 0xE0) === 0xC0) {
                    // 2-byte sequence
                    const byte2 = bytes[i + 1];
                    const codePoint = ((byte1 & 0x1F) << 6) | (byte2 & 0x3F);
                    result += String.fromCharCode(codePoint);
                    i += 2;
                  } else if ((byte1 & 0xF0) === 0xE0) {
                    // 3-byte sequence
                    const byte2 = bytes[i + 1];
                    const byte3 = bytes[i + 2];
                    const codePoint = ((byte1 & 0x0F) << 12) | ((byte2 & 0x3F) << 6) | (byte3 & 0x3F);
                    result += String.fromCharCode(codePoint);
                    i += 3;
                  } else if ((byte1 & 0xF8) === 0xF0) {
                    // 4-byte sequence (surrogate pairs for JS)
                    const byte2 = bytes[i + 1];
                    const byte3 = bytes[i + 2];
                    const byte4 = bytes[i + 3];
                    const codePoint = ((byte1 & 0x07) << 18) | ((byte2 & 0x3F) << 12) | ((byte3 & 0x3F) << 6) | (byte4 & 0x3F);
                    
                    // Convert to surrogate pair
                    const temp = codePoint - 0x10000;
                    result += String.fromCharCode((temp >> 10) + 0xD800, (temp & 0x3FF) + 0xDC00);
                    i += 4;
                  } else {
                    // Invalid sequence, skip
                    i++;
                  }
                }
                
                return result;
              }
              return str;
            }
          };
        }
        // Default: treat as string to encode
        return { 
          toString: function(enc) { 
            if (enc === 'base64') {
              return btoa(str);
            }
            return str; 
          } 
        };
      }
    };
  `);
  
  // Inject Node's native URL constructor for full spec compliance
  const urlParser = new ivm.Callback((urlString: string, base?: string) => {
    try {
      const parsed = new URL(urlString, base);
      return new ivm.ExternalCopy({
        href: parsed.href,
        protocol: parsed.protocol,
        host: parsed.host,
        hostname: parsed.hostname,
        port: parsed.port,
        pathname: parsed.pathname,
        search: parsed.search,
        hash: parsed.hash,
        origin: parsed.origin,
        searchParams: Object.fromEntries(parsed.searchParams.entries())
      }).copyInto();
    } catch (error: any) {
      throw new Error(error.message);
    }
  });
  
  await context.global.set('_nativeURLParser', urlParser);
  
  // Create URL constructor wrapper in VM context
  context.evalSync(`
    URL = function(url, base) {
      const parsed = _nativeURLParser(url, base);
      Object.assign(this, parsed);
      this.toString = function() { return this.href; };
      this.toJSON = function() { return this.href; };
    };
  `);
  
  // Inject crypto.randomUUID
  const randomUUIDCallback = new ivm.Callback(() => {
    return crypto.randomUUID();
  });
  
  await context.global.set('crypto', new ivm.ExternalCopy({
    randomUUID: randomUUIDCallback
  }).copyInto());
}
