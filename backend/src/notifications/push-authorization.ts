import { createHmac, timingSafeEqual } from 'node:crypto';

export const PUSH_PROOF_TTL_MS = 5 * 60 * 1000;

export type PushProofClaims = {
  u: string; // userId
  b: string; // businessId
  d: string; // deviceId
  v: number; // sessionVersion at issue time
  exp: number; // epoch ms
};

// Domain-separated key derived from JWT_SECRET; the secret itself is neither rotated nor used to sign directly.
function key(secret: string): Buffer {
  return createHmac('sha256', secret).update('push-authorization-v1').digest();
}

function mac(secret: string, body: string): Buffer {
  return createHmac('sha256', key(secret)).update(body).digest();
}

export function signPushProof(secret: string, claims: PushProofClaims): string {
  const body = Buffer.from(JSON.stringify(claims)).toString('base64url');
  return `${body}.${mac(secret, body).toString('base64url')}`;
}

export function verifyPushProof(
  secret: string,
  proof: string | undefined,
  now = Date.now(),
): PushProofClaims | null {
  if (!proof) return null;
  const [body, signature, extra] = proof.split('.');
  if (!body || !signature || extra !== undefined) return null;
  const expected = mac(secret, body);
  const given = Buffer.from(signature, 'base64url');
  if (given.length !== expected.length || !timingSafeEqual(given, expected))
    return null;
  try {
    const claims = JSON.parse(
      Buffer.from(body, 'base64url').toString('utf8'),
    ) as PushProofClaims;
    if (
      typeof claims.u !== 'string' ||
      typeof claims.b !== 'string' ||
      typeof claims.d !== 'string' ||
      !Number.isInteger(claims.v) ||
      typeof claims.exp !== 'number' ||
      claims.exp <= now
    )
      return null;
    return claims;
  } catch {
    return null;
  }
}
