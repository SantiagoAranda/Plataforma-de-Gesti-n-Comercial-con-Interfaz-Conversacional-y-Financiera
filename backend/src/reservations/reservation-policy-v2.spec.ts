import { Prisma } from '@prisma/client';
import {
  actionPolicy,
  cancellationReason,
  completionBlock,
  emptyEvidence,
  newReservationPolicy,
  noShowBlock,
  reservationArchiveBlock,
  reservationTransitionBlock,
  v2CompletedEvidenceBlock,
} from './reservation-lifecycle';

// 10:00–11:00 Bogotá on 2026-01-01 = 15:00Z–16:00Z.
const BEFORE = new Date('2026-01-01T14:59:00Z');
const STARTED = new Date('2026-01-01T15:00:00Z');
const ENDED = new Date('2026-01-01T16:00:00Z');
const v2 = (over: any = {}) => ({ id: 'r', status: 'CONFIRMED', archived: false, commercialPolicyVersion: 2, priceSnapshot: new Prisma.Decimal(30000), date: new Date('2026-01-01'), startMinute: 600, endMinute: 660, inventoryPostedAt: null, accountingPostedAt: null, ...over });
const openOrder = (over: any = {}) => ({ status: 'SENT', archived: false, accountingPostedAt: null, inventoryPostedAt: null, ...over });

describe('Reservation policy 2 (Bloque 2.2)', () => {
  it('creates every new reservation under policy 2, ignoring the deprecated business flag', async () => {
    const tx = () => ({
      business: { findUnique: jest.fn().mockResolvedValue({ reservationPolicyV2Enabled: false }) },
      item: { findFirst: jest.fn().mockResolvedValue({ price: new Prisma.Decimal('45000.50') }) },
    });
    const off = tx();
    expect(await newReservationPolicy(off, 'b', 'i')).toMatchObject({ commercialPolicyVersion: 2, status: 'CONFIRMED' });
    expect(off.business.findUnique).not.toHaveBeenCalled();
    const created = await newReservationPolicy(tx(), 'b', 'i');
    expect(created).toMatchObject({ commercialPolicyVersion: 2, status: 'CONFIRMED' });
    expect(String(created.priceSnapshot)).toBe('45000.5');
    expect((created as any).confirmedAt).toBeInstanceOf(Date);
    // Mirrors keep prices in OrderItem: no snapshot.
    expect((await newReservationPolicy(tx(), 'b', null) as any).priceSnapshot).toBeNull();
  });

  it('rejects the legacy confirm and never advertises it', () => {
    expect(reservationTransitionBlock(v2(), 'confirm')?.code).toBe('RESERVATION_USE_COMPLETE');
    const policy = actionPolicy('RESERVATION', v2(), v2(), emptyEvidence(), BEFORE);
    expect(policy.allowedActions).not.toContain('confirm');
    const mirror = actionPolicy('ORDER', openOrder(), v2(), emptyEvidence(), BEFORE);
    expect(mirror.allowedActions).not.toContain('confirm');
    expect(mirror.blockedActions.confirm?.code).toBe('RESERVATION_USE_COMPLETE');
  });

  it.each([
    [BEFORE, ['cancel', 'edit', 'reschedule', 'delete'], ['complete', 'noShow']],
    [STARTED, ['cancel', 'edit', 'reschedule', 'delete', 'complete'], ['noShow']],
    [ENDED, ['cancel', 'edit', 'reschedule', 'delete', 'complete', 'noShow'], []],
  ])('standalone CONFIRMED at %s', (now, allowed, denied) => {
    const { allowedActions } = actionPolicy('RESERVATION', v2(), v2(), emptyEvidence(), now as Date);
    for (const action of allowed) expect(allowedActions).toContain(action);
    for (const action of denied) expect(allowedActions).not.toContain(action);
  });

  it('COMPLETED and archived rows allow no ordinary mutation', () => {
    expect(actionPolicy('RESERVATION', v2({ status: 'COMPLETED' }), null, emptyEvidence(), ENDED).allowedActions).toEqual([]);
    expect(actionPolicy('RESERVATION', v2({ archived: true }), null, emptyEvidence(), ENDED).allowedActions).toEqual([]);
  });

  it('CANCELLED rows can only be archived', () => {
    expect(actionPolicy('RESERVATION', v2({ status: 'CANCELLED' }), null, emptyEvidence(), ENDED).allowedActions).toEqual(['delete']);
  });

  it('public cancellation closes at the start; Sales cancellation does not', () => {
    expect(reservationTransitionBlock(v2(), 'cancel', 'public', emptyEvidence(), BEFORE)).toBeUndefined();
    expect(reservationTransitionBlock(v2(), 'cancel', 'public', emptyEvidence(), STARTED)?.code).toBe('PUBLIC_CANCEL_WINDOW_CLOSED');
    expect(reservationTransitionBlock(v2(), 'cancel', 'sales', emptyEvidence(), STARTED)).toBeUndefined();
  });

  it('any commercial evidence on a CONFIRMED booking blocks every mutation as inconsistent', () => {
    const e = { ...emptyEvidence(), accounting: [{ amount: 1, nature: 'DEBIT' }] };
    for (const action of ['cancel', 'edit', 'reschedule', 'delete'] as const)
      expect(reservationTransitionBlock(v2(), action, 'sales', e)?.code).toBe('COMMERCIAL_EVIDENCE_INCONSISTENT');
    expect(completionBlock(v2(), null, e, STARTED)?.code).toBe('COMMERCIAL_EVIDENCE_INCONSISTENT');
    expect(reservationArchiveBlock(v2(), e)?.code).toBe('COMMERCIAL_EVIDENCE_INCONSISTENT');
  });

  it('completion of a mirror requires an open, unposted order', () => {
    expect(completionBlock(v2(), openOrder(), emptyEvidence(), STARTED)).toBeUndefined();
    expect(completionBlock(v2(), openOrder({ status: 'COMPLETED' }), emptyEvidence(), STARTED)?.code).toBe('ORDER_STATE_CONFLICT');
    expect(completionBlock(v2(), openOrder({ status: 'CANCELLED' }), emptyEvidence(), STARTED)?.code).toBe('ORDER_STATE_CONFLICT');
  });

  it('no-show only from the scheduled end, without effects, policy 2 only', () => {
    expect(noShowBlock(v2(), null, emptyEvidence(), new Date('2026-01-01T15:59:00Z'))?.code).toBe('RESERVATION_NOT_ENDED');
    expect(noShowBlock(v2(), null, emptyEvidence(), ENDED)).toBeUndefined();
    expect(noShowBlock(v2({ commercialPolicyVersion: 1 }), null, emptyEvidence(), ENDED)?.code).toBe('POLICY_NOT_SUPPORTED');
    expect(noShowBlock(v2({ status: 'COMPLETED' }), null, emptyEvidence(), ENDED)?.code).toBe('RESERVATION_STATE_CONFLICT');
    expect(noShowBlock(v2(), openOrder({ status: 'COMPLETED' }), emptyEvidence(), ENDED)?.code).toBe('ORDER_STATE_CONFLICT');
  });

  it('reserved system reasons cannot come from user input', () => {
    for (const value of ['NO_SHOW', ' no_show ', 'MIRROR_DETACHED_BY_EDIT'])
      expect(() => cancellationReason(value)).toThrow(expect.objectContaining({ response: expect.objectContaining({ code: 'RESERVED_CANCEL_REASON' }) }));
    expect(cancellationReason('El cliente avisó')).toBe('El cliente avisó');
  });

  describe('idempotent re-completion evidence', () => {
    const at = new Date();
    const cost = (amount: number) => [
      { amount, nature: 'DEBIT', pucCuentaCode: '6135' },
      { amount, nature: 'CREDIT', pucCuentaCode: '1435' },
    ];
    const free = (over: any = {}) => v2({ status: 'COMPLETED', priceSnapshot: new Prisma.Decimal(0), inventoryPostedAt: at, accountingPostedAt: at, ...over });

    it('free service without recipe: zero movements is valid', () => {
      expect(v2CompletedEvidenceBlock(free(), null, emptyEvidence())).toBeUndefined();
    });
    it('free service with consumption: balanced cost matching consumption is valid', () => {
      const e = { ...emptyEvidence(), accounting: cost(1200), inventory: [{ type: 'SALE', totalValue: 1200 }] };
      expect(v2CompletedEvidenceBlock(free(), null, e)).toBeUndefined();
    });
    it('free service with any income or mismatched cost is inconsistent', () => {
      const income = { ...emptyEvidence(), accounting: [{ amount: 100, nature: 'DEBIT', pucSubcuentaId: '110505' }, { amount: 100, nature: 'CREDIT', pucSubcuentaId: '413595' }] };
      expect(v2CompletedEvidenceBlock(free(), null, income)?.code).toBe('COMMERCIAL_EVIDENCE_INCONSISTENT');
      const mismatch = { ...emptyEvidence(), accounting: cost(500), inventory: [{ type: 'SALE', totalValue: 1200 }] };
      expect(v2CompletedEvidenceBlock(free(), null, mismatch)?.code).toBe('COMMERCIAL_EVIDENCE_INCONSISTENT');
      const unrecorded = { ...emptyEvidence(), inventory: [{ type: 'SALE', totalValue: 1200 }] };
      expect(v2CompletedEvidenceBlock(free(), null, unrecorded)?.code).toBe('COMMERCIAL_EVIDENCE_INCONSISTENT');
    });
    it('free completion without its markers is missing evidence', () => {
      expect(v2CompletedEvidenceBlock(free({ accountingPostedAt: null }), null, emptyEvidence())?.code).toBe('COMMERCIAL_EVIDENCE_MISSING');
    });
    it('paid standalone requires balanced income entries', () => {
      const paid = v2({ status: 'COMPLETED', inventoryPostedAt: at, accountingPostedAt: at });
      expect(v2CompletedEvidenceBlock(paid, null, emptyEvidence())?.code).toBe('COMMERCIAL_EVIDENCE_INCONSISTENT');
      const e = { ...emptyEvidence(), accounting: [{ amount: 30000, nature: 'DEBIT' }, { amount: 30000, nature: 'CREDIT' }] };
      expect(v2CompletedEvidenceBlock(paid, null, e)).toBeUndefined();
    });
  });

  it('policy 1 rules are unchanged', () => {
    const v1 = v2({ commercialPolicyVersion: 1, priceSnapshot: null });
    expect(reservationTransitionBlock(v1, 'confirm')).toBeUndefined();
    expect(reservationTransitionBlock(v1, 'edit')?.code).toBe('RESERVATION_STATE_CONFLICT');
    expect(reservationTransitionBlock(v1, 'cancel', 'public')?.code).toBe('RESERVATION_STATE_CONFLICT');
    expect(actionPolicy('RESERVATION', v1, v1, emptyEvidence(), ENDED).allowedActions).not.toContain('noShow');
  });
});
