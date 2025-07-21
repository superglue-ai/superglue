/**
 * Inject individual helper functions using context.global.set
 * This is the most reliable method for isolated-vm
 */
export async function injectVMHelpersIndividually(context: any): Promise<void> {
  // Use evalSync to inject all helpers at once
  // The code will run in the context and create global functions
  context.evalSync(`
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
    
    // escape function
    escape = function(str) {
      return str.replace(/[^\\x00-\\x7F]/g, function(char) {
        const code = char.charCodeAt(0);
        if (code < 256) {
          return '%' + code.toString(16).toUpperCase().padStart(2, '0');
        } else {
          return '%u' + code.toString(16).toUpperCase().padStart(4, '0');
        }
      });
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
                try {
                  return decodeURIComponent(escape(decoded));
                } catch (e) {
                  return decoded;
                }
              }
              return str;
            }
          };
        }
        return { toString: function() { return str; } };
      }
    };
  `);
}
