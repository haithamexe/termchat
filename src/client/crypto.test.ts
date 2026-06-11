import { describe, it, expect } from 'vitest';
import { getOrGenerateKeyPair, encryptMessage, decryptMessage } from './crypto.js';

describe('Crypto Module', () => {
  it('should generate valid key pairs', () => {
    const pair = getOrGenerateKeyPair();
    expect(pair.publicKey).toBeDefined();
    expect(pair.secretKey).toBeDefined();
  });

  it('should encrypt and decrypt messages between two users', () => {
    const alice = getOrGenerateKeyPair();
    const bob = getOrGenerateKeyPair();
    const plaintext = "Top secret DM!";

    // Alice encrypts a message for Bob
    const { ciphertext, nonce } = encryptMessage(plaintext, bob.publicKey, alice.secretKey);
    
    expect(ciphertext).not.toBe(plaintext);
    expect(nonce).toBeDefined();

    // Bob decrypts the message from Alice
    const decrypted = decryptMessage(ciphertext, nonce, alice.publicKey, bob.secretKey);
    expect(decrypted).toBe(plaintext);
  });

  it('should fail to decrypt with wrong key', () => {
    const alice = getOrGenerateKeyPair();
    const bob = getOrGenerateKeyPair();
    const eve = getOrGenerateKeyPair();
    
    const plaintext = "Top secret DM!";
    const { ciphertext, nonce } = encryptMessage(plaintext, bob.publicKey, alice.secretKey);

    // Eve tries to decrypt
    const decryptedByEve = decryptMessage(ciphertext, nonce, alice.publicKey, eve.secretKey);
    expect(decryptedByEve).toBeNull();
  });
});
