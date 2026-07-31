import { ConflictException, Injectable } from '@nestjs/common';
import { FiscalSourceType, Prisma } from '@prisma/client';

export class ElectronicInvoiceCreditNoteRequiredException extends ConflictException {
  constructor() {
    super({
      code: 'ELECTRONIC_INVOICE_CREDIT_NOTE_REQUIRED',
      message:
        'La venta tiene un documento electrónico validado y requiere nota crédito.',
    });
  }
}

/**
 * Extensión deliberadamente desacoplada. En 1B-0 no existe infraestructura de
 * facturación electrónica, por lo que el guard no consulta ningún proveedor.
 */
@Injectable()
export class ElectronicSaleReversalGuard {
  async assertCanReverse(
    _tx: Prisma.TransactionClient,
    _source: { sourceType: FiscalSourceType; sourceId: string; businessId: string },
  ) {
    return;
  }
}
