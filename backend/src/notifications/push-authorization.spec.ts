import { signPushProof, verifyPushProof } from './push-authorization';

describe('push authorization proof', () => {
  const claims = { u: 'user', b: 'biz', d: 'dev', v: 1, exp: 2_000_000 };

  it('round-trips and is bound to the signing secret', () => {
    const proof = signPushProof('secret-a', claims);
    expect(verifyPushProof('secret-a', proof, 1_000_000)).toEqual(claims);
    expect(verifyPushProof('secret-b', proof, 1_000_000)).toBeNull();
  });

  it('rejects expired, tampered, truncated and malformed proofs', () => {
    const proof = signPushProof('secret-a', claims);
    expect(verifyPushProof('secret-a', proof, 2_000_000)).toBeNull();
    const [body, signature] = proof.split('.');
    const forged = Buffer.from(
      JSON.stringify({ ...claims, d: 'other' }),
    ).toString('base64url');
    expect(verifyPushProof('secret-a', `${forged}.${signature}`, 0)).toBeNull();
    expect(verifyPushProof('secret-a', `${body}.`, 0)).toBeNull();
    expect(verifyPushProof('secret-a', `${body}.${signature}.x`, 0)).toBeNull();
    expect(verifyPushProof('secret-a', undefined, 0)).toBeNull();
    expect(verifyPushProof('secret-a', 'garbage', 0)).toBeNull();
  });
});
