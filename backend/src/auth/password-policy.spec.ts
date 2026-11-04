import {
  hashNewPassword,
  validateNewPassword,
  verifyPassword,
} from './password-policy';
import * as bcrypt from 'bcrypt';

describe('new password policy and historical verification', () => {
  afterEach(() => jest.restoreAllMocks());
  it.each([
    ['7 characters', 'Abcde1!'],
    ['no uppercase', 'abcdefg1!'],
    ['no number', 'Abcdefgh!'],
    ['no symbol', 'Abcdefg12'],
    ['only whitespace as symbol', 'Abcdefg1 '],
  ])('rejects %s', (_name, value) => {
    expect(() => validateNewPassword(value)).toThrow('8 caracteres');
  });
  it('accepts 8 characters with uppercase, number and symbol, without lowercase', () => {
    expect(() => validateNewPassword('ABCDEF1!')).not.toThrow();
    expect(() => validateNewPassword('12345A!6')).not.toThrow();
  });
  it('does not reject previously leaked or common passwords and makes no external call', () => {
    const fetcher = jest.spyOn(globalThis, 'fetch');
    expect(() => validateNewPassword('Password123!')).not.toThrow();
    expect(() => validateNewPassword('Qwerty123!')).not.toThrow();
    expect(fetcher).not.toHaveBeenCalled();
  });
  it('enforces the technical maximum of 1024 code points (4096 bytes UTF-8 is implied)', () => {
    expect(() => validateNewPassword('A1!' + 'a'.repeat(1021))).not.toThrow();
    expect(() => validateNewPassword('A1!' + 'a'.repeat(1022))).toThrow('1024');
    expect(() => validateNewPassword('A1!' + '🐱'.repeat(1021))).not.toThrow();
    expect(() => validateNewPassword('A1!' + '🐱'.repeat(1022))).toThrow(
      '1024',
    );
  });
  it('accepts Unicode, meaningful spaces and 64+ characters without truncation', async () => {
    const value = `  Á1${'🐱'.repeat(64)} fin  `;
    expect(() => validateNewPassword(value)).not.toThrow();
    const hash = await hashNewPassword(value);
    expect(hash).toMatch(/^\$argon2id\$/);
    await expect(verifyPassword(value, hash)).resolves.toBe(true);
    await expect(verifyPassword(value.trim(), hash)).resolves.toBe(false);
    await expect(
      verifyPassword(value.replace('fin', 'otra'), hash),
    ).resolves.toBe(false);
  });
  it('preserves bcrypt behavior for existing passwords including 72-byte truncation', async () => {
    const password = 'x'.repeat(72) + 'original';
    const hash = await bcrypt.hash(password, 10);
    await expect(
      verifyPassword('x'.repeat(72) + 'different', hash),
    ).resolves.toBe(true);
    await expect(verifyPassword(' x'.repeat(40), hash)).resolves.toBe(false);
  });
});
