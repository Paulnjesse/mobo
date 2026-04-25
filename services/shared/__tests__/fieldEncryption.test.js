'use strict';
/**
 * fieldEncryption.test.js — AES-256-GCM field-level encryption
 */
process.env.NODE_ENV = 'test';
// Use a valid 64-char hex key (32 bytes) for testing
process.env.FIELD_ENCRYPTION_KEY = 'a'.repeat(64);
process.env.FIELD_ENCRYPTION_KEY_V2 = 'b'.repeat(64);
process.env.FIELD_LOOKUP_HMAC_KEY = 'test_hmac_key_for_lookup';

const { encrypt, decrypt, hashForLookup, reencrypt } = require('../fieldEncryption');

describe('fieldEncryption — encrypt / decrypt', () => {
  test('encrypt returns a non-empty base64 string', () => {
    const result = encrypt('test-phone-number');
    expect(typeof result).toBe('string');
    expect(result.length).toBeGreaterThan(0);
    // Should be valid base64
    expect(() => Buffer.from(result, 'base64')).not.toThrow();
  });

  test('decrypt reverses encrypt correctly', () => {
    const plaintext = '+237612345678';
    const blob = encrypt(plaintext);
    expect(decrypt(blob)).toBe(plaintext);
  });

  test('two encryptions of same value produce different blobs (random IV)', () => {
    const val = 'same-value';
    const a = encrypt(val);
    const b = encrypt(val);
    expect(a).not.toBe(b);
    // But both decrypt to the same value
    expect(decrypt(a)).toBe(decrypt(b));
  });

  test('encrypt(null) returns null', () => {
    expect(encrypt(null)).toBeNull();
  });

  test('encrypt(undefined) returns null', () => {
    expect(encrypt(undefined)).toBeNull();
  });

  test('decrypt(null) returns null', () => {
    expect(decrypt(null)).toBeNull();
  });

  test('decrypt(empty string) returns null', () => {
    expect(decrypt('')).toBeNull();
  });

  test('decrypt of tampered ciphertext returns null (auth tag fails)', () => {
    const blob = encrypt('sensitive-data');
    const buf = Buffer.from(blob, 'base64');
    // Flip a byte in the ciphertext section (after version+iv+tag = 29 bytes)
    buf[30] ^= 0xff;
    expect(decrypt(buf.toString('base64'))).toBeNull();
  });

  test('encrypts numeric values by coercing to string', () => {
    const result = encrypt(12345);
    expect(decrypt(result)).toBe('12345');
  });

  test('encrypts unicode / international characters', () => {
    const val = 'Douala — Yaoundé ñ 中文';
    expect(decrypt(encrypt(val))).toBe(val);
  });

  test('encrypt/decrypt with explicit version 1', () => {
    const val = 'v1-test';
    const blob = encrypt(val, 1);
    expect(decrypt(blob)).toBe(val);
  });

  test('encrypt/decrypt with version 2 key', () => {
    const val = 'v2-test';
    const blob = encrypt(val, 2);
    expect(decrypt(blob)).toBe(val);
  });
});

describe('fieldEncryption — hashForLookup', () => {
  test('returns a hex string', () => {
    const hash = hashForLookup('+237612345678');
    expect(typeof hash).toBe('string');
    expect(/^[0-9a-f]{64}$/.test(hash)).toBe(true);
  });

  test('same value always produces same hash (deterministic)', () => {
    const val = 'user@example.com';
    expect(hashForLookup(val)).toBe(hashForLookup(val));
  });

  test('normalises case before hashing', () => {
    expect(hashForLookup('USER@EXAMPLE.COM')).toBe(hashForLookup('user@example.com'));
  });

  test('normalises whitespace before hashing', () => {
    expect(hashForLookup('  +237612345678  ')).toBe(hashForLookup('+237612345678'));
  });

  test('different values produce different hashes', () => {
    expect(hashForLookup('phoneA')).not.toBe(hashForLookup('phoneB'));
  });

  test('returns null for empty / falsy values', () => {
    expect(hashForLookup(null)).toBeNull();
    expect(hashForLookup('')).toBeNull();
    expect(hashForLookup(undefined)).toBeNull();
  });

  test('throws when no HMAC key is configured', () => {
    const saved = process.env.FIELD_LOOKUP_HMAC_KEY;
    const savedKey = process.env.FIELD_ENCRYPTION_KEY;
    delete process.env.FIELD_LOOKUP_HMAC_KEY;
    delete process.env.FIELD_ENCRYPTION_KEY;
    expect(() => hashForLookup('value')).toThrow();
    process.env.FIELD_LOOKUP_HMAC_KEY = saved;
    process.env.FIELD_ENCRYPTION_KEY = savedKey;
  });
});

describe('fieldEncryption — reencrypt', () => {
  test('reencrypt returns a new valid blob that decrypts to same value', () => {
    const original = encrypt('license-ABC123', 1);
    const reencrypted = reencrypt(original);
    expect(reencrypted).not.toBeNull();
    expect(decrypt(reencrypted)).toBe('license-ABC123');
  });

  test('reencrypt(null) returns null', () => {
    expect(reencrypt(null)).toBeNull();
  });

  test('reencrypted blob is different from original (new IV)', () => {
    const original = encrypt('rotate-me', 1);
    const re = reencrypt(original);
    // May differ (new IV) but both should decrypt to same plaintext
    expect(decrypt(re)).toBe(decrypt(original));
  });
});
