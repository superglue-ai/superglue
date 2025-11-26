/**
 * Shared VM helpers that can be injected into both isolated-vm contexts (backend)
 * and Function contexts (frontend) to ensure consistent behavior.
 * 
 * This ensures frontend template evaluation matches backend behavior.
 */

export const VM_HELPERS_CODE = `
  // String.prototype.matchAll polyfill
  if (!String.prototype.matchAll) {
    String.prototype.matchAll = function(regexp) {
      if (typeof regexp === 'string') {
        regexp = new RegExp(regexp, 'g');
      }
      if (!(regexp instanceof RegExp)) {
        regexp = new RegExp(regexp, 'g');
      }
      if (!regexp.global) {
        throw new TypeError('matchAll requires a global RegExp');
      }
      const matches = [];
      const str = this;
      const regex = new RegExp(regexp.source, regexp.flags);
      let match;
      while ((match = regex.exec(str)) !== null) {
        matches.push(match);
      }
      return matches[Symbol.iterator] ? matches[Symbol.iterator]() : (function* () {
        for (let i = 0; i < matches.length; i++) {
          yield matches[i];
        }
      })();
    };
  }
  
  // String.prototype.replaceAll polyfill
  if (!String.prototype.replaceAll) {
    String.prototype.replaceAll = function(search, replace) {
      if (search instanceof RegExp) {
        if (!search.global) {
          throw new TypeError('replaceAll requires a global RegExp');
        }
        return this.replace(search, replace);
      }
      if (typeof replace === 'function') {
        const parts = this.split(search);
        let result = parts[0];
        for (let i = 1; i < parts.length; i++) {
          result += replace(search, result.length, this) + parts[i];
        }
        return result;
      }
      return this.split(search).join(replace);
    };
  }
  
  // Array.prototype.flat polyfill
  if (!Array.prototype.flat) {
    Array.prototype.flat = function(depth) {
      depth = depth === undefined ? 1 : Math.floor(depth);
      if (depth < 1) return Array.prototype.slice.call(this);
      return (function flatten(arr, d) {
        return arr.reduce(function(acc, val) {
          return acc.concat(d > 1 && Array.isArray(val) ? flatten(val, d - 1) : val);
        }, []);
      })(this, depth);
    };
  }
  
  // Array.prototype.flatMap polyfill
  if (!Array.prototype.flatMap) {
    Array.prototype.flatMap = function(callback, thisArg) {
      return this.map(callback, thisArg).flat(1);
    };
  }
  
  // Object.fromEntries polyfill
  if (!Object.fromEntries) {
    Object.fromEntries = function(entries) {
      const obj = {};
      for (const [key, value] of entries) {
        obj[key] = value;
      }
      return obj;
    };
  }
  
  // String.prototype.trimStart/trimEnd polyfills
  if (!String.prototype.trimStart) {
    String.prototype.trimStart = function() {
      return this.replace(/^\\s+/, '');
    };
    String.prototype.trimLeft = String.prototype.trimStart;
  }
  if (!String.prototype.trimEnd) {
    String.prototype.trimEnd = function() {
      return this.replace(/\\s+$/, '');
    };
    String.prototype.trimRight = String.prototype.trimEnd;
  }
  
  // String.prototype.padStart/padEnd polyfills
  if (!String.prototype.padStart) {
    String.prototype.padStart = function(targetLength, padString) {
      targetLength = targetLength >> 0;
      padString = String(typeof padString !== 'undefined' ? padString : ' ');
      if (this.length >= targetLength || padString.length === 0) {
        return String(this);
      }
      targetLength = targetLength - this.length;
      if (targetLength > padString.length) {
        const repeatCount = Math.ceil(targetLength / padString.length);
        padString = padString.repeat(repeatCount);
      }
      return padString.slice(0, targetLength) + String(this);
    };
  }
  if (!String.prototype.padEnd) {
    String.prototype.padEnd = function(targetLength, padString) {
      targetLength = targetLength >> 0;
      padString = String(typeof padString !== 'undefined' ? padString : ' ');
      if (this.length >= targetLength || padString.length === 0) {
        return String(this);
      }
      targetLength = targetLength - this.length;
      if (targetLength > padString.length) {
        const repeatCount = Math.ceil(targetLength / padString.length);
        padString = padString.repeat(repeatCount);
      }
      return String(this) + padString.slice(0, targetLength);
    };
  }
  
  // Array.prototype.at polyfill
  if (!Array.prototype.at) {
    Array.prototype.at = function(index) {
      index = Math.trunc(index) || 0;
      const len = this.length;
      const relativeIndex = index >= 0 ? index : len + index;
      if (relativeIndex < 0 || relativeIndex >= len) {
        return undefined;
      }
      return this[relativeIndex];
    };
    String.prototype.at = Array.prototype.at;
  }
  
  // Array.prototype.findLast/findLastIndex polyfills
  if (!Array.prototype.findLast) {
    Array.prototype.findLast = function(callback, thisArg) {
      for (let i = this.length - 1; i >= 0; i--) {
        if (callback.call(thisArg, this[i], i, this)) {
          return this[i];
        }
      }
      return undefined;
    };
  }
  if (!Array.prototype.findLastIndex) {
    Array.prototype.findLastIndex = function(callback, thisArg) {
      for (let i = this.length - 1; i >= 0; i--) {
        if (callback.call(thisArg, this[i], i, this)) {
          return i;
        }
      }
      return -1;
    };
  }
  
  // Object.hasOwn polyfill
  if (!Object.hasOwn) {
    Object.hasOwn = function(obj, prop) {
      return Object.prototype.hasOwnProperty.call(obj, prop);
    };
  }
  
  // Base64 encoding
  if (typeof btoa === 'undefined') {
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
  }
  
  // Base64 decoding
  if (typeof atob === 'undefined') {
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
  }
  
  // escape function - encode each byte of UTF-8
  if (typeof escape === 'undefined') {
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
  }
  
  // decodeURIComponent function
  if (typeof decodeURIComponent === 'undefined') {
    decodeURIComponent = function(str) {
      return str.replace(/%([0-9A-F]{2})/gi, function(match, p1) {
        return String.fromCharCode(parseInt(p1, 16));
      });
    };
  }
  
  // Buffer object
  if (typeof Buffer === 'undefined') {
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
  }
  
  // URL constructor (simplified version for frontend - backend will override with native implementation)
  if (typeof URL === 'undefined' || !URL.prototype) {
    const NativeURL = typeof window !== 'undefined' && window.URL ? window.URL : (typeof globalThis !== 'undefined' && globalThis.URL ? globalThis.URL : null);
    if (NativeURL) {
      URL = function(url, base) {
        try {
          const parsed = new NativeURL(url, base);
          Object.assign(this, {
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
          });
          this.toString = function() { return this.href; };
          this.toJSON = function() { return this.href; };
        } catch (error) {
          throw new Error(error.message);
        }
      };
    }
    // If no native URL available (e.g., isolated-vm), leave it undefined - backend will inject it
  }
  
  // crypto.randomUUID
  if (typeof crypto === 'undefined' || !crypto.randomUUID) {
    if (typeof crypto === 'undefined') {
      crypto = {};
    }
    crypto.randomUUID = function() {
      return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
        const r = Math.random() * 16 | 0;
        const v = c === 'x' ? r : (r & 0x3 | 0x8);
        return v.toString(16);
      });
    };
  }
`;

/**
 * Execute code in a Function context with VM helpers injected.
 * This ensures frontend template evaluation matches backend behavior.
 */
export function executeWithVMHelpers(code: string, sourceData: any): any {
  // Create a function that includes the helpers and executes the code
  const wrappedCode = `
    ${VM_HELPERS_CODE}
    
    const fn = ${code};
    return fn(sourceData);
  `;
  
  try {
    const fn = new Function('sourceData', wrappedCode);
    return fn(sourceData);
  } catch (error) {
    throw new Error(`Code execution failed: ${error instanceof Error ? error.message : String(error)}`);
  }
}

