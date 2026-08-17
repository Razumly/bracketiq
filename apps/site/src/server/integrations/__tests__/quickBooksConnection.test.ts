/** @jest-environment node */


import { decryptSecret, encryptSecret } from '@/server/integrations/secretCrypto';

describe('secretCrypto', () => {
  it('encrypts and decrypts secrets without storing plaintext', () => {
    const encrypted = encryptSecret('refresh-token-123', 'test-key');

    expect(encrypted).not.toContain('refresh-token-123');
    expect(decryptSecret(encrypted, 'test-key')).toBe('refresh-token-123');
  });
});

