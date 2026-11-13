import { ConflictException, BadRequestException } from '@nestjs/common';
import { Prisma } from '@prisma/client';

export type SaleAction = 'confirm' | 'complete' | 'cancel' | 'edit' | 'reschedule' | 'delete' | 'reverse' | 'noShow';
export type ActionBlock = { code: string; message: string };
export type CommercialEvidence = { accounting: any[]; inventory: any[]; fiscal: any[] };
export const emptyEvidence = (): CommercialEvidence => ({ accounting: [], inventory: [], fiscal: [] });
const block = (code: string, message: string): ActionBlock => ({ code, message });
export function lifecycleConflict(reason: ActionBlock): never {
  throw new ConflictException(reason);
}
export function requireServiceProvided(value: unknown) {
  if (value !== true) throw new BadRequestException(block('SERVICE_PROVISION_CONFIRMATION_REQUIRED', 'Confirmá explícitamente que el servicio efectivamente se prestó.'));
}
/** System-written cancel reasons. Never accepted from user input, so they stay unequivocal evidence. */
export const NO_SHOW_REASON = 'NO_SHOW';
export const MIRROR_DETACHED_REASON = 'MIRROR_DETACHED_BY_EDIT';
const RESERVED_CANCEL_REASONS = [NO_SHOW_REASON, MIRROR_DETACHED_REASON];
export function cancellationReason(value: unknown): string | null {
  if (value == null) return null;
  if (typeof value !== 'string' || value.trim().length > 1000) throw new BadRequestException('El motivo debe ser un texto de hasta 1000 caracteres.');
  if (RESERVED_CANCEL_REASONS.includes(value.trim().toUpperCase()))
    throw new BadRequestException(block('RESERVED_CANCEL_REASON', 'Ese motivo está reservado para el sistema. Para registrar una ausencia usá «No asistió».'));
  return value.trim() || null;
}
export const isPolicyV2 = (reservation: any) => reservation?.commercialPolicyVersion === 2;
/** Policy 2 standalone reservations are free when the agreed price is exactly zero. */
export const isFreeV2 = (reservation: any) => isPolicyV2(reservation) && reservation.priceSnapshot != null && new Prisma.Decimal(reservation.priceSnapshot).isZero();
/** Minute-of-day "now" in America/Bogota, compared against the stored service day. */
function bogotaNow(now: Date) {
  const parts = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Bogota', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).formatToParts(now);
  const part = (key: string) => parts.find(p => p.type === key)!.value;
  return { today: `${part('year')}-${part('month')}-${part('day')}`, minute: Number(part('hour')) * 60 + Number(part('minute')) };
}
/** True once the given minute of the reservation day has been reached in Bogotá. */
export function reservationReached(reservation: any, minuteOfDay: number, now = new Date()) {
  const { today, minute } = bogotaNow(now);
  const date = new Date(reservation.date).toISOString().slice(0, 10);
  return date < today || (date === today && minuteOfDay <= minute);
}
export function hasCommercialEffects(owner: any, evidence?: CommercialEvidence) {
  return Boolean(owner?.inventoryPostedAt || owner?.accountingPostedAt || evidence?.accounting.length || evidence?.inventory.length || evidence?.fiscal.length);
}
/**
 * Every new reservation uses policy 2 (booked = CONFIRMED, commercial effects on completion).
 * Policy 1 survives only on historical rows: commercialPolicyVersion is fixed for the row's life.
 * Business.reservationPolicyV2Enabled is no longer read (column kept, deprecated).
 * itemId = null for Sales mirrors, whose agreed prices live in OrderItem.
 */
export async function newReservationPolicy(tx: any, businessId: string, itemId: string | null) {
  const item = itemId ? await tx.item.findFirst({ where: { id: itemId, businessId }, select: { price: true } }) : null;
  return { commercialPolicyVersion: 2, status: 'CONFIRMED' as const, confirmedAt: new Date(), priceSnapshot: item ? item.price : null };
}
export function isReversal(m: any) {
  return String(m.accountingRole ?? '').startsWith('SALE_REVERSAL:') || m.metadata?.kind === 'SALE_REVERSAL';
}
export function commercialBlock(owner: any, evidence: CommercialEvidence, isOrder: boolean): ActionBlock | undefined {
  if (!owner.inventoryPostedAt || (isOrder && !owner.accountingPostedAt))
    return block('COMMERCIAL_EVIDENCE_MISSING', 'Falta evidencia del registro comercial. No se puede finalizar la atención.');
  if (evidence.accounting.some(isReversal) || evidence.inventory.some(m => m.type === 'SALE_RETURN'))
    return block('COMMERCIAL_EFFECTS_REVERSED', 'La operación tiene efectos comerciales revertidos.');
  // Inventory can legitimately have no rows: posting records a successful no-consumption operation.
  // Zero-valued accounting lines are valid; never recalculate historical prices or recipes.
  const originals = evidence.accounting.filter(m => !isReversal(m));
  let debit = new Prisma.Decimal(0), credit = new Prisma.Decimal(0);
  for (const movement of originals) {
    const amount = new Prisma.Decimal(movement.amount);
    if (!amount.isFinite() || amount.isNegative() || !['DEBIT', 'CREDIT'].includes(movement.nature))
      return block('COMMERCIAL_EVIDENCE_INCONSISTENT', 'Los registros contables requieren revisión.');
    if (movement.nature === 'DEBIT') debit = debit.add(amount);
    else credit = credit.add(amount);
  }
  if (!originals.length || !originals.some(m => m.nature === 'DEBIT') || !originals.some(m => m.nature === 'CREDIT') || debit.sub(credit).abs().gt(1))
    return block('COMMERCIAL_EVIDENCE_INCONSISTENT', 'Faltan registros contables o el asiento está desbalanceado.');
  // Verify recorded cost against recorded consumption, never against today's recipe.
  const consumedValue = evidence.inventory.filter(m => m.type === 'SALE').reduce((sum, m) => sum.add(m.totalValue ?? 0), new Prisma.Decimal(0)).toDecimalPlaces(2);
  if (consumedValue.gt(0)) {
    const total = (nature: string, account: string) => originals.filter(m => m.nature === nature && String(m.pucCuentaCode ?? m.pucSubcuentaId ?? '').startsWith(account)).reduce((sum, m) => sum.add(m.amount), new Prisma.Decimal(0));
    if (total('DEBIT', '6135').sub(consumedValue).abs().gt(1) || total('CREDIT', '1435').sub(consumedValue).abs().gt(1))
      return block('COMMERCIAL_EVIDENCE_INCONSISTENT', 'El consumo registrado no tiene sus contrapartidas contables completas.');
  }
}
/** Policy 2 free completion: only real cost movements, never income, matching consumption. */
function freeCompletionBlock(reservation: any, evidence: CommercialEvidence): ActionBlock | undefined {
  if (!reservation.inventoryPostedAt || !reservation.accountingPostedAt)
    return block('COMMERCIAL_EVIDENCE_MISSING', 'Falta evidencia del registro comercial. No se puede finalizar la atención.');
  if (evidence.accounting.some(isReversal) || evidence.inventory.some(m => m.type === 'SALE_RETURN'))
    return block('COMMERCIAL_EFFECTS_REVERSED', 'La operación tiene efectos comerciales revertidos.');
  const consumed = evidence.inventory.filter(m => m.type === 'SALE').reduce((sum, m) => sum.add(m.totalValue ?? 0), new Prisma.Decimal(0)).toDecimalPlaces(2);
  const account = (m: any) => String(m.pucCuentaCode ?? m.pucSubcuentaId ?? '');
  const sum = (nature: string, prefix: string) => evidence.accounting.filter(m => m.nature === nature && account(m).startsWith(prefix)).reduce((t, m) => t.add(m.amount), new Prisma.Decimal(0));
  const onlyCost = evidence.accounting.every(m => (m.nature === 'DEBIT' && account(m).startsWith('6135')) || (m.nature === 'CREDIT' && account(m).startsWith('1435')));
  // No consumption value and no movements is the valid outcome of a free service without recipe.
  if (!onlyCost || sum('DEBIT', '6135').sub(consumed).abs().gt(1) || sum('CREDIT', '1435').sub(consumed).abs().gt(1))
    return block('COMMERCIAL_EVIDENCE_INCONSISTENT', 'Los registros contables de la atención gratuita requieren revisión.');
}
/** Evidence check for an already COMPLETED policy 2 reservation (idempotent re-completion). */
export function v2CompletedEvidenceBlock(reservation: any, order: any | null, evidence: CommercialEvidence): ActionBlock | undefined {
  if (order) return order.status === 'COMPLETED' ? commercialBlock(order, evidence, true) : block('MIRROR_ORDER_NOT_COMPLETED', 'La venta vinculada no está registrada comercialmente.');
  return isFreeV2(reservation) ? freeCompletionBlock(reservation, evidence) : commercialBlock(reservation, evidence, true);
}
export function completionBlock(reservation: any, order: any | null, evidence: CommercialEvidence, now = new Date()): ActionBlock | undefined {
  if (reservation.archived || order?.archived) return block('RECORD_ARCHIVED', 'El registro está eliminado.');
  if (reservation.status !== 'CONFIRMED') return block('RESERVATION_STATE_CONFLICT', 'Solo se pueden finalizar reservas confirmadas.');
  if (isPolicyV2(reservation)) {
    // Policy 2: completion itself posts. Effects must not exist yet; the mirror order must be open.
    if (order && (order.status !== 'SENT' || order.accountingPostedAt || order.inventoryPostedAt))
      return block('ORDER_STATE_CONFLICT', 'La venta vinculada no está en un estado que permita finalizar la atención.');
    if (!reservationReached(reservation, reservation.startMinute, now)) return block('RESERVATION_NOT_STARTED', 'El horario de la reserva todavía no comenzó.');
    if (hasCommercialEffects(reservation, evidence) || hasCommercialEffects(order, evidence))
      return block('COMMERCIAL_EVIDENCE_INCONSISTENT', 'La reserva tiene registros comerciales previos que requieren revisión.');
    return;
  }
  if (order && order.status !== 'COMPLETED') return block('MIRROR_ORDER_NOT_COMPLETED', 'La venta vinculada no está registrada comercialmente.');
  if (!reservationReached(reservation, reservation.startMinute, now))
    return block('RESERVATION_NOT_STARTED', 'El horario de la reserva todavía no comenzó.');
  return commercialBlock(order ?? reservation, evidence, Boolean(order));
}
/** Policy 2 only: the customer did not attend. Cancels without any commercial effect. */
export function noShowBlock(reservation: any, order: any | null, evidence: CommercialEvidence, now = new Date()): ActionBlock | undefined {
  if (reservation.archived || order?.archived) return block('RECORD_ARCHIVED', 'El registro está eliminado.');
  if (!isPolicyV2(reservation)) return block('POLICY_NOT_SUPPORTED', 'Esta reserva sigue el circuito anterior y no admite registrar ausencia.');
  if (reservation.status !== 'CONFIRMED') return block('RESERVATION_STATE_CONFLICT', 'Solo se puede registrar la ausencia de una reserva confirmada.');
  if (order && order.status !== 'SENT') return block('ORDER_STATE_CONFLICT', 'La venta vinculada no permite registrar la ausencia.');
  if (hasCommercialEffects(reservation, evidence) || hasCommercialEffects(order, evidence))
    return block('COMMERCIAL_EVIDENCE_INCONSISTENT', 'La reserva tiene registros comerciales que requieren revisión.');
  if (!reservationReached(reservation, reservation.endMinute, now)) return block('RESERVATION_NOT_ENDED', 'La ausencia se registra cuando termina el horario reservado.');
}
export function reservationTransitionBlock(reservation: any, action: 'confirm' | 'cancel' | 'edit' | 'reschedule' | 'delete', channel: 'sales' | 'internal' | 'public' = 'sales', evidence?: CommercialEvidence, now = new Date()): ActionBlock | undefined {
  if (action === 'cancel' && reservation.status === 'CANCELLED') return;
  if (reservation.archived) return block('RECORD_ARCHIVED', 'El registro está eliminado.');
  if (isPolicyV2(reservation)) return v2TransitionBlock(reservation, action, channel, evidence, now);
  const status = reservation.status;
  const permitted = action === 'confirm' ? ['PENDING', 'CONFIRMED']
    : action === 'cancel' ? (channel === 'sales' ? ['PENDING', 'CONFIRMED'] : ['PENDING'])
    : action === 'delete' ? ['PENDING', 'CANCELLED'] : ['PENDING'];
  if (!permitted.includes(status)) {
    const message = action === 'reschedule' ? 'Solo se pueden reprogramar reservas pendientes.'
      : action === 'edit' ? 'Reservation not editable in current status'
      : action === 'cancel' && status === 'CONFIRMED' && channel === 'internal' ? 'Las reservas confirmadas solo se pueden cancelar desde Ventas.'
      : action === 'cancel' && status === 'CONFIRMED' && channel === 'public' ? 'Esta reserva ya está confirmada. Contactá al negocio para cancelarla.'
      : 'La acción no está permitida en el estado actual de la reserva.';
    return block('RESERVATION_STATE_CONFLICT', message);
  }
}
/** Policy 2: CONFIRMED is an operational booking without effects; COMPLETED is immutable. */
function v2TransitionBlock(reservation: any, action: 'confirm' | 'cancel' | 'edit' | 'reschedule' | 'delete', channel: 'sales' | 'internal' | 'public', evidence: CommercialEvidence | undefined, now: Date): ActionBlock | undefined {
  if (action === 'confirm') return block('RESERVATION_USE_COMPLETE', 'Esta reserva ya está confirmada. Usá «Finalizar atención» cuando el servicio se preste.');
  const permitted = action === 'delete' ? ['CONFIRMED', 'CANCELLED'] : ['CONFIRMED'];
  if (!permitted.includes(reservation.status))
    return block('RESERVATION_STATE_CONFLICT', reservation.status === 'COMPLETED' ? 'La atención ya fue finalizada.' : 'La acción no está permitida en el estado actual de la reserva.');
  if (hasCommercialEffects(reservation, evidence))
    return block('COMMERCIAL_EVIDENCE_INCONSISTENT', 'La reserva tiene registros comerciales que requieren revisión.');
  if (action === 'cancel' && channel === 'public' && reservationReached(reservation, reservation.startMinute, now))
    return block('PUBLIC_CANCEL_WINDOW_CLOSED', 'El turno ya comenzó. Contactá al negocio para cancelarlo.');
}
export function reverseBlock(order: any, evidence: CommercialEvidence): ActionBlock | undefined {
  if (order.status !== 'COMPLETED' || !order.inventoryPostedAt) return block('ORDER_STATE_CONFLICT', 'La venta no se puede revertir en su estado actual.');
  if (evidence.inventory.some(m => m.type === 'SALE_RETURN')) return block('COMMERCIAL_EFFECTS_REVERSED', 'El inventario ya fue revertido.');
  if (evidence.fiscal.some(d => d.type === 'INVOICE' && ['PENDING', 'PROCESSING', 'RETRYABLE_FAILURE', 'SUBMITTED_PENDING_DIAN', 'LOCAL_PERSISTENCE_FAILURE'].includes(d.status)))
    return block('FISCAL_SYNCHRONIZATION_REQUIRED', 'Sincronizá la factura antes de revertir la venta.');
  if (evidence.fiscal.some(d => d.type === 'INVOICE' && d.status === 'VALIDATED' && !evidence.fiscal.some(c => c.parentDocumentId === d.id && c.type === 'CREDIT_NOTE' && c.status === 'VALIDATED')))
    return block('VALIDATED_CREDIT_NOTE_REQUIRED', 'La factura requiere una nota crédito validada antes de revertir la venta.');
}
export function reservationArchiveBlock(reservation: any, evidence: CommercialEvidence): ActionBlock | undefined {
  const state = reservationTransitionBlock(reservation, 'delete', 'sales', evidence);
  if (state) return state;
  if (isPolicyV2(reservation)) return;
  const hasEffects = reservation.inventoryPostedAt || evidence.accounting.length || evidence.inventory.length;
  if (!hasEffects) return;
  // Pending archival also cancels. It must never hide an unexplained posting.
  if (reservation.status === 'PENDING' || !evidence.accounting.some(isReversal))
    return block('COMMERCIAL_EFFECTS_PENDING', 'Los efectos comerciales requieren revisión antes de eliminar.');
  const balances = new Map<string, Prisma.Decimal>();
  const inventoryBalances = new Map<string, Prisma.Decimal>();
  for (const movement of evidence.accounting) {
    const key = String(movement.pucSubcuentaId ?? movement.pucCuentaCode);
    const amount = new Prisma.Decimal(movement.amount).mul(movement.nature === 'DEBIT' ? 1 : -1);
    balances.set(key, (balances.get(key) ?? new Prisma.Decimal(0)).add(amount));
  }
  for (const movement of evidence.inventory) {
    const key = `${movement.ingredientId ?? ''}:${movement.itemId ?? ''}:${movement.orderItemId ?? ''}`;
    const quantity = new Prisma.Decimal(movement.quantity).mul(movement.type === 'SALE_RETURN' ? 1 : -1);
    inventoryBalances.set(key, (inventoryBalances.get(key) ?? new Prisma.Decimal(0)).add(quantity));
  }
  if ([...balances.values()].some(amount => amount.abs().gt(1)) ||
      [...inventoryBalances.values()].some(quantity => !quantity.isZero()))
    return block('COMMERCIAL_EFFECTS_PENDING', 'Los efectos comerciales requieren revisión antes de eliminar.');
}
export function orderTransitionBlock(order: any, action: 'confirm' | 'cancel' | 'edit' | 'delete', mirror?: any): ActionBlock | undefined {
  if (order.archived) return block('RECORD_ARCHIVED', 'El registro está eliminado.');
  if (action === 'delete') {
    if (order.status === 'COMPLETED' && order.inventoryPostedAt) return block('ORDER_INVENTORY_POSTED', 'No se puede eliminar una venta confirmada con inventario impactado. Primero debe revertirse.');
    if (mirror?.status === 'COMPLETED') return block('RESERVATION_STATE_CONFLICT', 'No se puede cancelar implícitamente una atención finalizada.');
    return;
  }
  if (action === 'edit' && (order.inventoryPostedAt || order.accountingPostedAt)) return block('ORDER_ALREADY_POSTED', order.inventoryPostedAt ? 'Order inventory has already been posted' : 'Order accounting has already been posted');
  const states = action === 'confirm' ? ['DRAFT', 'SENT', 'COMPLETED'] : action === 'cancel' ? ['DRAFT', 'SENT', 'CANCELLED'] : ['DRAFT', 'SENT'];
  if (!states.includes(order.status)) return block('ORDER_STATE_CONFLICT', 'La acción no está permitida en el estado actual de la venta.');
}
export function actionPolicy(sourceType: 'ORDER' | 'RESERVATION', record: any, reservation: any | null, evidence: CommercialEvidence, now = new Date()) {
  const allowedActions: SaleAction[] = [];
  const blockedActions: Partial<Record<SaleAction, ActionBlock>> = {};
  const evaluate = (action: SaleAction, reason?: ActionBlock) => reason ? blockedActions[action] = reason : allowedActions.push(action);
  if (record.archived) return { allowedActions, blockedActions: { complete: block('RECORD_ARCHIVED', 'El registro está eliminado.') } };
  if (sourceType === 'RESERVATION') {
    for (const action of ['confirm', 'cancel', 'edit', 'reschedule', 'delete'] as const) {
      const reason = action === 'delete' ? reservationArchiveBlock(record, evidence) : reservationTransitionBlock(record, action, 'sales', evidence, now);
      if ((action === 'confirm' && record.status === 'CONFIRMED') || (action === 'cancel' && record.status === 'CANCELLED')) continue;
      evaluate(action, reason);
    }
    evaluate('complete', completionBlock(record, null, evidence, now));
    if (isPolicyV2(record)) evaluate('noShow', noShowBlock(record, null, evidence, now));
  } else {
    const v2Mirror = isPolicyV2(reservation);
    if (!orderTransitionBlock(record, 'edit') && !(v2Mirror && reservation.status !== 'CONFIRMED')) { allowedActions.push('edit'); if (reservation) allowedActions.push('reschedule'); }
    if (v2Mirror) blockedActions.confirm = block('RESERVATION_USE_COMPLETE', 'Usá «Finalizar atención» cuando el servicio se preste.');
    else if (record.status !== 'COMPLETED') evaluate('confirm', orderTransitionBlock(record, 'confirm'));
    if (record.status !== 'CANCELLED') evaluate('cancel', orderTransitionBlock(record, 'cancel'));
    evaluate('delete', orderTransitionBlock(record, 'delete', reservation));
    if (record.status === 'COMPLETED') evaluate('reverse', reverseBlock(record, evidence));
    if (reservation) evaluate('complete', completionBlock(reservation, record, evidence, now));
    if (v2Mirror) evaluate('noShow', noShowBlock(reservation, record, evidence, now));
  }
  return { allowedActions, blockedActions };
}
/** Stable transport for transaction races; never retry a user's decision automatically. */
export function throwLifecycleError(error: any): never {
  if (['P2034', 'P2028'].includes(error?.code) || ['40001', '40P01', '55P03'].includes(String(error?.meta?.code)))
    lifecycleConflict(block('RESERVATION_CONCURRENT_MODIFICATION', 'El registro cambió durante la operación. Actualizá e intentá nuevamente.'));
  throw error;
}
