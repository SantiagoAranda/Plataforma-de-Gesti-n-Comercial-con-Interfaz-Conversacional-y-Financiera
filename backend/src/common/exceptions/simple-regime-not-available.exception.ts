import { ConflictException } from '@nestjs/common';

export const SIMPLE_REGIME_NOT_AVAILABLE = 'SIMPLE_REGIME_NOT_AVAILABLE';
export const SIMPLE_REGIME_NOT_AVAILABLE_MESSAGE =
  'Régimen Simple no está disponible en esta versión.';

export class SimpleRegimeNotAvailableException extends ConflictException {
  constructor() {
    super({
      code: SIMPLE_REGIME_NOT_AVAILABLE,
      message: SIMPLE_REGIME_NOT_AVAILABLE_MESSAGE,
    });
  }
}
