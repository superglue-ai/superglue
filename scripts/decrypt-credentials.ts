import crypto from "crypto";
import dotenv from "dotenv";

dotenv.config();

const ALGORITHM = "aes-256-cbc";
const IV_LENGTH = 16;

function decryptCredentials(encryptedObj: Record<string, string>): Record<string, string> {
  const masterKeyString = process.env.MASTER_ENCRYPTION_KEY;

  if (!masterKeyString) {
    console.error("❌ MASTER_ENCRYPTION_KEY not found in .env");
    process.exit(1);
  }

  const key = crypto.createHash("sha256").update(masterKeyString).digest();
  const decrypted: Record<string, string> = {};

  for (const [field, value] of Object.entries(encryptedObj)) {
    if (value && String(value).startsWith("enc:")) {
      try {
        const parts = value.split(":");
        if (parts.length !== 3) throw new Error("Invalid format");

        const iv = Buffer.from(parts[1], "hex");
        const encrypted = parts[2];

        const decipher = crypto.createDecipheriv(ALGORITHM, key, iv);
        let decryptedValue = decipher.update(encrypted, "hex", "utf8");
        decryptedValue += decipher.final("utf8");

        decrypted[field] = decryptedValue;
        console.log(`✓ ${field}: ${decryptedValue}`);
      } catch (error) {
        console.error(`❌ Failed to decrypt ${field}:`, error);
        decrypted[field] = value;
      }
    } else {
      decrypted[field] = value;
      console.log(`⚠ ${field}: ${value} (not encrypted)`);
    }
  }

  return decrypted;
}

// Usage: Pass encrypted JSON as argument or edit below
const args = process.argv.slice(2);

if (args.length === 0) {
  console.log('Usage: npm run decrypt -- \'{"api_key":"enc:...","token":"enc:..."}\'');
  console.log("\nOr edit the script and add your encrypted object below:\n");

  // Edit this object with your encrypted credentials
  const encryptedCredentials = {
    // Example: api_key: "enc:a1b2c3...:d4e5f6..."
  };

  if (Object.keys(encryptedCredentials).length > 0) {
    console.log("Decrypting credentials from script...\n");
    decryptCredentials(encryptedCredentials);
  }
} else {
  try {
    const encryptedObj = JSON.parse(args[0]);
    console.log("Decrypting credentials...\n");
    const result = decryptCredentials(encryptedObj);
    console.log("\n📋 Decrypted JSON:");
    console.log(JSON.stringify(result, null, 2));
  } catch (error) {
    console.error("❌ Invalid JSON:", error);
    process.exit(1);
  }
}
