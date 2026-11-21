import { actionPolicy, cancellationReason, commercialBlock, completionBlock, emptyEvidence, requireServiceProvided, reservationTransitionBlock, throwLifecycleError } from './reservation-lifecycle';

const posted = new Date('2026-01-01T15:00:00Z');
const reservation = (status = 'CONFIRMED') => ({ id: 'r', status, archived: false, date: new Date('2026-01-01'), startMinute: 600, inventoryPostedAt: posted });
const evidence = () => ({ ...emptyEvidence(), accounting: [{ amount: 100, nature: 'DEBIT' }, { amount: 100, nature: 'CREDIT' }] });

describe('Reservation lifecycle policy', () => {
  it.each([
    ['PENDING', 'confirm', true], ['PENDING', 'cancel', true], ['PENDING', 'edit', true], ['PENDING', 'delete', true],
    ['CONFIRMED', 'confirm', true], ['CONFIRMED', 'cancel', true], ['CONFIRMED', 'edit', false], ['CONFIRMED', 'delete', false],
    ['CANCELLED', 'confirm', false], ['CANCELLED', 'cancel', true], ['CANCELLED', 'delete', true],
    ['COMPLETED', 'confirm', false], ['COMPLETED', 'cancel', false], ['COMPLETED', 'edit', false], ['COMPLETED', 'delete', false],
  ])('%s %s permitted=%s', (status, action, permitted) => {
    expect(!reservationTransitionBlock(reservation(status as string), action as any)).toBe(permitted);
  });
  it.each([undefined, null, false, 'true', 1])('requires explicit boolean declaration: %s', value => {
    expect(() => requireServiceProvided(value)).toThrow(expect.objectContaining({ response: expect.objectContaining({ code: 'SERVICE_PROVISION_CONFIRMATION_REQUIRED' }) }));
  });
  it('accepts true only', () => expect(() => requireServiceProvided(true)).not.toThrow());
  it('permits no-consumption service and zero-valued ledger lines', () => {
    const e = evidence(); e.accounting.push({ amount: 0, nature: 'DEBIT' });
    expect(commercialBlock(reservation(), e, false)).toBeUndefined();
  });
  it('does not treat markers as proof when accounting is missing, unbalanced or reversed', () => {
    expect(commercialBlock(reservation(), emptyEvidence(), false)?.code).toBe('COMMERCIAL_EVIDENCE_INCONSISTENT');
    const e = evidence(); e.accounting[0].amount = 50;
    expect(commercialBlock(reservation(), e, false)?.code).toBe('COMMERCIAL_EVIDENCE_INCONSISTENT');
    const reversed = evidence(); (reversed.accounting[0] as any).metadata = { kind: 'SALE_REVERSAL' };
    expect(commercialBlock(reservation(), reversed, false)?.code).toBe('COMMERCIAL_EFFECTS_REVERSED');
  });
  it('blocks returns even when accounting balances', () => {
    const e = evidence(); e.inventory.push({ type: 'SALE_RETURN' });
    expect(commercialBlock(reservation(), e, false)?.code).toBe('COMMERCIAL_EFFECTS_REVERSED');
  });
  it('allows completion from the exact Bogota starting minute, not before', () => {
    expect(completionBlock(reservation(), null, evidence(), new Date('2026-01-01T14:59:59Z'))?.code).toBe('RESERVATION_NOT_STARTED');
    expect(completionBlock(reservation(), null, evidence(), new Date('2026-01-01T15:00:00Z'))).toBeUndefined();
  });
  it.each(['PENDING', 'CANCELLED', 'COMPLETED'])('does not advertise completion for %s', status => {
    expect(completionBlock(reservation(status), null, evidence())?.code).toBe('RESERVATION_STATE_CONFLICT');
  });
  it('requires commercial closure of mirror order without consulting fiscal status', () => {
    expect(completionBlock(reservation(), { status: 'SENT' }, evidence())?.code).toBe('MIRROR_ORDER_NOT_COMPLETED');
    const e = evidence(); e.fiscal.push({ status: 'PROCESSING', type: 'INVOICE' });
    expect(completionBlock(reservation(), { status: 'COMPLETED', inventoryPostedAt: posted, accountingPostedAt: posted }, e)).toBeUndefined();
  });
  it('missing completion evidence does not suppress permitted cancellation', () => {
    const result = actionPolicy('RESERVATION', reservation(), reservation(), emptyEvidence());
    expect(result.allowedActions).toContain('cancel');
    expect(result.allowedActions).not.toContain('complete');
    expect(result.blockedActions.complete?.code).toBe('COMMERCIAL_EVIDENCE_INCONSISTENT');
  });
  it('retains existing order archive eligibility and protects completed mirror', () => {
    const order = { status: 'COMPLETED', inventoryPostedAt: null };
    expect(actionPolicy('ORDER', order, null, emptyEvidence()).allowedActions).toContain('delete');
    expect(actionPolicy('ORDER', order, reservation('COMPLETED'), emptyEvidence()).allowedActions).not.toContain('delete');
  });
  it('does not offer ordinary cancellation of completed orders, fiscal or otherwise', () => {
    expect(actionPolicy('ORDER', { status: 'COMPLETED', inventoryPostedAt: posted }, null, emptyEvidence()).allowedActions).not.toContain('cancel');
  });
  it.each(['internal', 'public'])('confirmed cancellation is not offered to %s', channel => {
    expect(reservationTransitionBlock(reservation(), 'cancel', channel as any)?.code).toBe('RESERVATION_STATE_CONFLICT');
  });
  it('preserves structured transaction conflict codes', () => {
    expect(() => throwLifecycleError({ code: 'P2034' })).toThrow(expect.objectContaining({ response: expect.objectContaining({ code: 'RESERVATION_CONCURRENT_MODIFICATION' }) }));
  });
  it('validates optional cancellation reason', () => {
    expect(cancellationReason('  cliente pidió cancelar  ')).toBe('cliente pidió cancelar');
    expect(cancellationReason(' ')).toBeNull();
    expect(() => cancellationReason('x'.repeat(1001))).toThrow();
  });
});
