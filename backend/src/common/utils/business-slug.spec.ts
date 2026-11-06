import { generateBusinessSlug, validateCustomBusinessSlug, retryBusinessSlugTransaction } from './business-slug';
import { generateSlug } from './slug.util';

describe('New business identifiers, independent of legacy URL normalization', () => {
  it.each([
    [' TecnoGames ', 'tecnogames'], ['Niño & Co', 'nino-y-co'], ['---', 'negocio'],
    ['a', 'negocio'], ['a--b', 'a-b'], ['💥', 'negocio'], ['admin', 'admin-2'],
    ['a'.repeat(51), 'a'.repeat(50)],
  ])('generates %s as %s', async (name, expected) => {
    expect(await generateBusinessSlug(name, async () => true)).toBe(expected);
  });
  it('keeps suffix inside the limit and starts duplicates at 2', async () => {
    const used = new Set<string>();
    for (let i = 1; i <= 12; i++) {
      const slug = await generateBusinessSlug('a'.repeat(60), async s => !used.has(s));
      expect(slug).toHaveLength(50);
      expect(slug).toBe(i === 1 ? 'a'.repeat(50) : 'a'.repeat(50 - `-${i}`.length) + `-${i}`);
      used.add(slug);
    }
  });
  it.each([null, undefined, 3, {}, [], '', 'ab', 'UPPER', 'has space', '-abc', 'abc-', 'a--b', 'a'.repeat(51), 'admin', 'reservations', 'registro'])('rejects custom %j', value => {
    expect(() => validateCustomBusinessSlug(value)).toThrow();
  });
  it.each(['abc', 'abc-123', 'a'.repeat(50)])('accepts custom %s', value => {
    expect(validateCustomBusinessSlug(value)).toBe(value);
  });
  it('does not change legacy resolution of reserved, short or long identifiers', async () => {
    expect(await generateSlug('ADMIN')).toBe('admin');
    expect(await generateSlug('a')).toBe('a');
    expect(await generateSlug('a'.repeat(60))).toHaveLength(60);
  });
  it.each(['slug', 'Business_slug_key', 'BusinessSlug_pkey'])('retries full transaction for %s', async target => {
    const run = jest.fn().mockRejectedValueOnce({ code: 'P2002', meta: { target: [target] } }).mockResolvedValue('ok');
    expect(await retryBusinessSlugTransaction(run)).toBe('ok');
    expect(run).toHaveBeenCalledTimes(2);
  });
  it('bounds retries and does not retry duplicate emails or unrelated errors', async () => {
    const run = jest.fn().mockRejectedValue({ code: 'P2034' });
    await expect(retryBusinessSlugTransaction(run)).rejects.toThrow('Intentá nuevamente');
    expect(run).toHaveBeenCalledTimes(5);
    const other = jest.fn().mockRejectedValue({ code: 'P2002', meta: { target: ['email'] } });
    await expect(retryBusinessSlugTransaction(other)).rejects.toMatchObject({ code: 'P2002' });
    expect(other).toHaveBeenCalledTimes(1);
  });
});
