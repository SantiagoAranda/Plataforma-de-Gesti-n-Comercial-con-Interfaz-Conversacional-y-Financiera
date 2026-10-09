import { BadRequestException } from '@nestjs/common';
import { Prisma } from '@prisma/client';

// A persisted marker describes the guarantees actually captured at sale closure.
// It deliberately does not depend on a deployment date.
export const INVOICE_CLOSE_SNAPSHOT_VERSION = 2;
export const TAX_CALCULATED = 'TAX_CALCULATED';
export const TAX_DISABLED_AT_CLOSE = 'TAX_DISABLED_AT_CLOSE';

function nonEmpty(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0;
}

export function buyerIdentityState(fiscal: any): 'CONSUMER_FINAL' | 'IDENTIFIED' | 'EXPLICIT_INCOMPLETE' {
  const document = nonEmpty(fiscal?.buyerDocumentNumber);
  const name = nonEmpty(fiscal?.buyerName) && fiscal.buyerName.trim().toLowerCase() !== 'consumidor final';
  const explicit = document || fiscal?.buyerType === 'JURIDICA' || name || nonEmpty(fiscal?.buyerEmail) ||
    nonEmpty(fiscal?.fiscalMunicipalityCode) ||
    ['buyerIsIvaResponsable', 'buyerIsRetenedor', 'buyerIsGranContribuyente',
      'buyerIsAutorretenedor', 'buyerIsRegimenSimple', 'buyerRequiresElectronicInvoice']
      .some((key) => fiscal?.[key] === true);
  if (!explicit) return 'CONSUMER_FINAL';
  return document && name ? 'IDENTIFIED' : 'EXPLICIT_INCOMPLETE';
}

function finiteAmount(value: unknown, allowZero = true, allowDecimal = false): number | null {
  if (value === null || value === undefined || typeof value === 'boolean' ||
    (typeof value !== 'number' && typeof value !== 'string' &&
      !(allowDecimal && value instanceof Prisma.Decimal))) return null;
  if (typeof value === 'string' && !value.trim()) return null;
  const number = Number(value);
  return Number.isFinite(number) && number >= 0 && (allowZero || number > 0) ? number : null;
}

function validCode(value: unknown): boolean {
  return nonEmpty(value);
}

export function invoiceCloseSnapshot(raw: unknown): any | null {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
  const value = (raw as Record<string, any>).invoiceCloseSnapshot;
  return value?.version === INVOICE_CLOSE_SNAPSHOT_VERSION ? value : null;
}

export function requiresLegacyInvoiceWarning(raw: unknown): boolean {
  return !invoiceCloseSnapshot(raw);
}

export function assertInvoiceHistory(order: any): void {
  const close = invoiceCloseSnapshot(order.taxSnapshot?.rawCalculation);
  const rawMarker = order.taxSnapshot?.rawCalculation?.invoiceCloseSnapshot;
  if (rawMarker !== undefined && !close)
    throw new BadRequestException('El snapshot fiscal de cierre tiene una versión inválida.');
  if (close?.fiscalState === TAX_DISABLED_AT_CLOSE || (close && close.taxSettingsEnabled !== true)) {
    throw new BadRequestException('La venta se cerró con la configuración fiscal deshabilitada y no conserva información tributaria suficiente para emitir una factura electrónica.');
  }
  const context = order.fiscalContext;
  const snapshot = order.taxSnapshot;
  if (!context || !snapshot || !Array.isArray(order.taxLines) || !Array.isArray(order.items) || !order.items.length) {
    throw new BadRequestException(
      'No se puede generar la factura electrónica porque esta venta no conserva toda la información fiscal necesaria.',
    );
  }
  const subtotal = close ? finiteAmount(context.subtotal, true, true) : Number(context.subtotal);
  const charged = close ? finiteAmount(context.chargedTaxTotal, true, true) : Number(context.chargedTaxTotal);
  const total = close ? finiteAmount(order.total, true, true) : Number(order.total);
  const raw = snapshot.rawCalculation;
  if (!raw || typeof raw !== 'object' || Array.isArray(raw) ||
    !['subtotal', 'vatTotal', 'impoconsumoTotal'].every((key) => close
      ? finiteAmount(raw[key]) !== null : Number.isFinite(Number(raw[key])))) {
    throw new BadRequestException('La venta no conserva el cálculo tributario necesario para emitir su factura electrónica.');
  }
  if (subtotal === null || charged === null || total === null || Math.abs(subtotal - total) > 0.01) {
    throw new BadRequestException('La información fiscal de la venta no coincide con su total histórico.');
  }
  const chargeLines = order.taxLines.filter((line: any) => line.applied && line.direction === 'CHARGE' && ['IVA', 'IMPOCONSUMO'].includes(line.taxType));
  const sum = chargeLines.reduce((value: number, line: any) => value + Number(line.taxAmount), 0);
  if (Math.abs(Number(raw.subtotal) - subtotal) > 0.01 ||
    Math.abs(Number(raw.vatTotal) + Number(raw.impoconsumoTotal) - charged) > 0.01) {
    throw new BadRequestException('El cálculo tributario histórico no coincide con los impuestos de la venta.');
  }
  const itemIds = new Set(order.items.map((line: any) => line.id));
  if (!Number.isFinite(sum) || Math.abs(sum - charged) > 0.01 || chargeLines.some((line: any) => !itemIds.has(line.orderItemId))) {
    throw new BadRequestException('Los impuestos históricos de la venta no son trazables a sus ítems.');
  }
  if (close) {
    if (close.fiscalState !== TAX_CALCULATED)
      throw new BadRequestException('El estado fiscal del snapshot de cierre es inválido.');
    if (!snapshot.buyerFiscal || typeof snapshot.buyerFiscal !== 'object' || Array.isArray(snapshot.buyerFiscal))
      throw new BadRequestException('El snapshot fiscal de cierre está incompleto.');
    if (!nonEmpty(close.capturedAt) || !Number.isFinite(Date.parse(close.capturedAt)) ||
      finiteAmount(context.withheldTaxTotal, true, true) === null ||
      finiteAmount(context.netReceived, true, true) === null ||
      chargeLines.some((line: any) => finiteAmount(line.rate, true, true) === null ||
        finiteAmount(line.taxAmount, true, true) === null))
      throw new BadRequestException('El snapshot fiscal de cierre está incompleto.');
    const buyerState = buyerIdentityState(snapshot.buyerFiscal);
    const fiscalBuyer = snapshot.buyerFiscal;
    const documentCodes: Record<string, string> = { NIT: '31', CC: '13', CE: '21', PASAPORTE: '41', TI: '12' };
    const expectedDocumentCode = buyerState === 'CONSUMER_FINAL' ? '13' :
      documentCodes[fiscalBuyer?.buyerDocumentType ?? 'CC'] ?? '13';
    if (buyerState === 'EXPLICIT_INCOMPLETE' || close.buyerState !== buyerState ||
      (buyerState === 'IDENTIFIED' && close.buyer?.identification === '22222222222'))
      throw new BadRequestException('El comprador informado no conserva nombre y documento fiscal suficientes para emitir la factura electrónica.');
    const lineIds = order.items.map((line: any) => line.id).sort();
    const frozenIds = Array.isArray(close.orderItemIds) ? [...close.orderItemIds].sort() : [];
    const frozenSubtotal = Array.isArray(close.items) && close.items.every((line: any) => line && typeof line === 'object' && !Array.isArray(line) &&
      finiteAmount(line.price) !== null && finiteAmount(line.quantity, false) !== null)
      ? close.items.reduce((value: number, line: any) => value + Number(line.price) * Number(line.quantity), 0) : NaN;
    const frozenTaxesMatch = Array.isArray(close.items) && close.items.length === order.items.length &&
      close.items.every((line: any, index: number) => {
      const original = order.items.find((item: any) => item.id === close.orderItemIds?.[index]);
      if (!line || typeof line !== 'object' || Array.isArray(line) || !original ||
        line.code_reference !== original.itemId ||
        finiteAmount(original.quantity, false, true) === null || finiteAmount(original.unitPrice, true, true) === null ||
        Math.abs(Number(line.quantity) - Number(original.quantity)) > 0.005 ||
        Math.abs(Number(line.price) - Number(original.unitPrice)) > 0.005) return false;
      const expected = chargeLines.filter((tax: any) => tax.orderItemId === original.id)
        .map((tax: any) => ({ code: tax.taxType === 'IVA' ? '01' : '04', rate: Number(tax.rate) * 100 }))
        .sort((a: any, b: any) => `${a.code}:${a.rate}`.localeCompare(`${b.code}:${b.rate}`));
      const actual = Array.isArray(line.taxes) ? line.taxes
        .map((tax: any) => ({ code: tax?.code, rate: finiteAmount(tax?.rate) }))
        .sort((a: any, b: any) => `${a.code}:${a.rate}`.localeCompare(`${b.code}:${b.rate}`)) : [];
      return expected.length === actual.length && expected.every((tax: any, taxIndex: number) =>
        tax.code === actual[taxIndex].code && Number.isFinite(tax.rate) && actual[taxIndex].rate !== null &&
        Math.abs(tax.rate - actual[taxIndex].rate) <= 0.005);
      });
    if (!nonEmpty(close.seller?.nit) || !validCode(close.buyer?.identification_document_code) ||
      close.buyer.identification_document_code !== expectedDocumentCode ||
      !nonEmpty(close.buyer?.identification) ||
      (buyerState === 'IDENTIFIED' && (close.buyer.identification !== fiscalBuyer.buyerDocumentNumber ||
        (fiscalBuyer.buyerType === 'JURIDICA' ? close.buyer.company : close.buyer.names) !== fiscalBuyer.buyerName)) ||
      !(nonEmpty(close.buyer?.names) || nonEmpty(close.buyer?.company)) ||
      !validCode(close.payment?.payment_form) || !validCode(close.payment?.payment_method_code) ||
      !Array.isArray(close.items) || close.items.length !== order.items.length ||
      frozenIds.length !== new Set(frozenIds).size || JSON.stringify(lineIds) !== JSON.stringify(frozenIds) ||
      close.items.some((line: any) => !line || typeof line !== 'object' || Array.isArray(line) ||
        !validCode(line.code_reference) || !nonEmpty(line.name) ||
        !validCode(line.unit_measure_code) || !validCode(line.standard_code) ||
        finiteAmount(line.price) === null || finiteAmount(line.quantity, false) === null ||
        finiteAmount(line.discount_rate) === null ||
        !Array.isArray(line.taxes) || line.taxes.some((tax: any) =>
          !validCode(tax?.code) || finiteAmount(tax?.rate) === null)) ||
      !frozenTaxesMatch || !Number.isFinite(frozenSubtotal) || Math.abs(frozenSubtotal - subtotal) > 0.01 ||
      finiteAmount(close.total) === null || finiteAmount(close.payment.amount) === null ||
      Math.abs(Number(close.total) - (subtotal + charged)) > 0.01 ||
      Math.abs(Number(close.payment.amount) - Number(close.total)) > 0.01) {
      throw new BadRequestException('El snapshot fiscal de cierre está incompleto.');
    }
  }
}
