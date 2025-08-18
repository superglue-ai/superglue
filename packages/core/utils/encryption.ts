import crypto from 'crypto';
import { logMessage } from './logs.js';

const ALGORITHM = 'aes-256-cbc';
const IV_LENGTH = 16;

export class CredentialEncryption {
    private key: Buffer | null = null;

    constructor() {
        const masterKeyString = process.env.MASTER_ENCRYPTION_KEY;
        
        if (masterKeyString) {
            // Create a 32-byte key from the master key string
            this.key = crypto.createHash('sha256').update(masterKeyString).digest();
        } else {
            logMessage('warn', '⚠️  MASTER_ENCRYPTION_KEY not set - credentials will be stored in plaintext');
        }
    }

    isEnabled(): boolean {
        return this.key !== null;
    }

    encrypt(credentials: Record<string, string> | null | undefined): Record<string, string> | null | undefined {
        if (!this.isEnabled() || !credentials) {
            return credentials;
        }

        const encryptedCredentials: Record<string, string> = {};
        
        for (const [key, value] of Object.entries(credentials)) {
            if (value) {
                // Generate random IV for each value
                const iv = crypto.randomBytes(IV_LENGTH);
                const cipher = crypto.createCipheriv(ALGORITHM, this.key!, iv);
                
                let encrypted = cipher.update(value, 'utf8', 'hex');
                encrypted += cipher.final('hex');
                
                // Combine IV and encrypted data
                encryptedCredentials[key] = `enc:${iv.toString('hex')}:${encrypted}`;
            } else {
                encryptedCredentials[key] = value;
            }
        }
        
        return encryptedCredentials;
    }

    decrypt(encryptedCredentials: Record<string, string> | null | undefined): Record<string, string> | null | undefined {
        if (!this.isEnabled() || !encryptedCredentials) {
            return encryptedCredentials;
        }

        const decryptedCredentials: Record<string, string> = {};
        
        for (const [key, value] of Object.entries(encryptedCredentials)) {
            if (value && String(value).startsWith('enc:')) {
                try {
                    // Split format: enc:iv:encryptedData
                    const parts = value.split(':');
                    if (parts.length !== 3) throw new Error('Invalid encrypted format');
                    
                    const iv = Buffer.from(parts[1], 'hex');
                    const encrypted = parts[2];
                    
                    const decipher = crypto.createDecipheriv(ALGORITHM, this.key!, iv);
                    let decrypted = decipher.update(encrypted, 'hex', 'utf8');
                    decrypted += decipher.final('utf8');
                    
                    decryptedCredentials[key] = decrypted;
                } catch (error) {
                    logMessage('error', `Failed to decrypt credential ${key}: ${error}`);
                    throw new Error('Failed to decrypt credentials');
                }
            } else {
                decryptedCredentials[key] = value;
            }
        }
        
        return decryptedCredentials;
    }
}

// Export a singleton instance
export const credentialEncryption = new CredentialEncryption(); 