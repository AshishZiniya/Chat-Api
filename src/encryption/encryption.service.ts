import { Injectable } from '@nestjs/common';
import * as crypto from 'crypto';

@Injectable()
export class EncryptionService {
  private algorithm = 'aes-256-gcm';
  private keyLength = 32; // 256 bits
  private ivLength = 16; // 128 bits

  // Generate a random encryption key
  generateKey(): string {
    return crypto.randomBytes(this.keyLength).toString('hex');
  }

  // Encrypt message content
  encrypt(
    text: string,
    key: string,
  ): { encrypted: string; iv: string; tag: string } {
    const iv = crypto.randomBytes(this.ivLength);
    const cipher = crypto.createCipheriv(
      this.algorithm,
      Buffer.from(key, 'hex'),
      iv,
    ) as crypto.CipherGCM;

    let encrypted = cipher.update(text, 'utf8', 'hex');
    encrypted += cipher.final('hex');

    const tag = cipher.getAuthTag();

    return {
      encrypted,
      iv: iv.toString('hex'),
      tag: tag.toString('hex'),
    };
  }

  // Decrypt message content
  decrypt(encrypted: string, key: string, iv: string, tag: string): string {
    const decipher = crypto.createDecipheriv(
      this.algorithm,
      Buffer.from(key, 'hex'),
      Buffer.from(iv, 'hex'),
    ) as crypto.DecipherGCM;
    decipher.setAuthTag(Buffer.from(tag, 'hex'));

    let decrypted = decipher.update(encrypted, 'hex', 'utf8');
    decrypted += decipher.final('utf8');

    return decrypted;
  }

  // Hash user ID for consistent key derivation
  hashUserId(userId: string): string {
    return crypto.createHash('sha256').update(userId).digest('hex');
  }

  // Derive encryption key from user IDs (for end-to-end encryption)
  deriveSharedKey(userId1: string, userId2: string): string {
    const combined = [userId1, userId2].sort().join('');
    return crypto.createHash('sha256').update(combined).digest('hex');
  }

  // Encrypt file data
  encryptFile(
    buffer: Buffer,
    key: string,
  ): { encrypted: Buffer; iv: string; tag: string } {
    const iv = crypto.randomBytes(this.ivLength);
    const cipher = crypto.createCipheriv(
      this.algorithm,
      Buffer.from(key, 'hex'),
      iv,
    ) as crypto.CipherGCM;

    const encrypted = Buffer.concat([cipher.update(buffer), cipher.final()]);

    const tag = cipher.getAuthTag();

    return {
      encrypted,
      iv: iv.toString('hex'),
      tag: tag.toString('hex'),
    };
  }

  // Decrypt file data
  decryptFile(
    encryptedBuffer: Buffer,
    key: string,
    iv: string,
    tag: string,
  ): Buffer {
    const decipher = crypto.createDecipheriv(
      this.algorithm,
      Buffer.from(key, 'hex'),
      Buffer.from(iv, 'hex'),
    ) as crypto.DecipherGCM;
    decipher.setAuthTag(Buffer.from(tag, 'hex'));

    const decrypted = Buffer.concat([
      decipher.update(encryptedBuffer),
      decipher.final(),
    ]);

    return decrypted;
  }
}
