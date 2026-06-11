import nacl from "tweetnacl";
import { encodeBase64, decodeBase64, encodeUTF8, decodeUTF8 } from "tweetnacl-util";

export interface KeyPair {
  publicKey: string; // Base64
  secretKey: string; // Base64
}

export function getOrGenerateKeyPair(): KeyPair {
  const pair = nacl.box.keyPair();
  return {
    publicKey: encodeBase64(pair.publicKey),
    secretKey: encodeBase64(pair.secretKey),
  };
}

export function encryptMessage(text: string, recipientPublicKeyBase64: string, mySecretKeyBase64: string): { ciphertext: string, nonce: string } {
  const nonce = nacl.randomBytes(nacl.box.nonceLength);
  const messageUint8 = decodeUTF8(text);
  const recipientPublicKey = decodeBase64(recipientPublicKeyBase64);
  const mySecretKey = decodeBase64(mySecretKeyBase64);

  const encrypted = nacl.box(messageUint8, nonce, recipientPublicKey, mySecretKey);
  
  return {
    ciphertext: encodeBase64(encrypted),
    nonce: encodeBase64(nonce)
  };
}

export function decryptMessage(ciphertextBase64: string, nonceBase64: string, senderPublicKeyBase64: string, mySecretKeyBase64: string): string | null {
  try {
    const ciphertext = decodeBase64(ciphertextBase64);
    const nonce = decodeBase64(nonceBase64);
    const senderPublicKey = decodeBase64(senderPublicKeyBase64);
    const mySecretKey = decodeBase64(mySecretKeyBase64);

    const decrypted = nacl.box.open(ciphertext, nonce, senderPublicKey, mySecretKey);
    if (!decrypted) return null;
    return encodeUTF8(decrypted);
  } catch (e) {
    return null;
  }
}
