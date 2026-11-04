import { BadRequestException } from '@nestjs/common';
import * as argon2 from 'argon2';
import * as bcrypt from 'bcrypt';

// Mirrored in frontend/src/lib/auth/new-password.ts; keep both in sync.
export function validateNewPassword(password: string): void {
  const length = Array.from(password).length;
  if (length > 1024 || Buffer.byteLength(password, 'utf8') > 4096) {
    throw new BadRequestException(
      'La contraseña no puede superar los 1024 caracteres.',
    );
  }
  if (
    length < 8 ||
    !/\p{Lu}/u.test(password) ||
    !/\p{Nd}/u.test(password) ||
    !/[^\p{L}\p{N}\p{M}\s]/u.test(password)
  ) {
    throw new BadRequestException(
      'La contraseña debe tener al menos 8 caracteres, una mayúscula, un número y un símbolo.',
    );
  }
}

export function hashNewPassword(password: string): Promise<string> {
  return argon2.hash(password, {
    type: argon2.argon2id,
    memoryCost: 19456,
    timeCost: 2,
    parallelism: 1,
  });
}

export async function verifyPassword(
  password: string,
  hash: string,
): Promise<boolean> {
  if (hash.startsWith('$argon2id$')) return argon2.verify(hash, password);
  if (/^\$2[aby]\$/.test(hash)) return bcrypt.compare(password, hash);
  return false;
}
