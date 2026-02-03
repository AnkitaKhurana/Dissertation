/**
 * Generate extension ID from private key file
 * Chrome extension IDs are derived from the public key
 */

import fs from 'fs';
import crypto from 'crypto';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const pemPath = path.join(__dirname, '..', 'dist.pem');

if (!fs.existsSync(pemPath)) {
  console.error('Error: dist.pem not found. Run "Pack extension" in Chrome first.');
  process.exit(1);
}

const pemContent = fs.readFileSync(pemPath, 'utf8');

// Extract private key and convert to public key
const privateKey = crypto.createPrivateKey({
  key: pemContent,
  format: 'pem'
});

// Export public key in DER/SPKI format
const publicKey = crypto.createPublicKey(privateKey);
const publicKeyDer = publicKey.export({
  type: 'spki',
  format: 'der'
});

// Convert to base64 for manifest.json
const publicKeyBase64 = publicKeyDer.toString('base64');

// Generate extension ID (first 128 bits of SHA256 hash, converted to letters a-p)
const hash = crypto.createHash('sha256').update(publicKeyDer).digest();
const extensionId = Array.from(hash.slice(0, 16))
  .map(byte => String.fromCharCode(97 + (byte % 16)))
  .join('');

console.log('\n=== Chrome Extension Key Info ===\n');
console.log('Extension ID:', extensionId);
console.log('\nPublic key for manifest.json:');
console.log(publicKeyBase64);
console.log('\nAzure Vault Secret Value:');
console.log(`chrome-extension://${extensionId}/src/options.html`);
console.log('\n');
