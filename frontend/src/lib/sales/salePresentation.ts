import { useEffect } from 'react';
import type { Sale, SaleAction } from '@/src/types/sales';
import { getStatusStyles } from '@/src/lib/statusStyles';

const reservationBadges = {
  PENDING: getStatusStyles('PENDIENTE'),
  CONFIRMED: getStatusStyles('CONFIRMADO'),
  COMPLETED: { ...getStatusStyles('FINALIZADA'), label: 'Finalizado' },
  CANCELLED: getStatusStyles('CANCELADO'),
};
const noShowBadge = { ...getStatusStyles('CANCELADO'), label: 'No asistió' };
export const NO_SHOW_REASON = 'NO_SHOW';
export const isNoShow = (sale: Pick<Sale, 'reservationStatus' | 'cancelReason'>) =>
  sale.reservationStatus === 'CANCELLED' && sale.cancelReason === NO_SHOW_REASON;

// A non-null valid reservationStatus is the DTO's explicit mirror association.
// Item types and commercial closure never establish that association.
export function getSaleBadge(sale: Pick<Sale, 'sourceType' | 'status' | 'reservationStatus'> & Partial<Pick<Sale, 'cancelReason'>>) {
  const valid = typeof sale.reservationStatus === 'string' && Object.hasOwn(reservationBadges, sale.reservationStatus);
  const operational = (sale.sourceType === 'ORDER' || sale.sourceType === 'RESERVATION') && valid;
  return {
    operational,
    // «No asistió» derives from CANCELLED + NO_SHOW; there is no extra Prisma state.
    styles: operational ? (isNoShow(sale) ? noShowBadge : reservationBadges[sale.reservationStatus as keyof typeof reservationBadges]) : getStatusStyles(sale.status),
    diagnostic: !valid && (sale.sourceType === 'RESERVATION' || sale.reservationStatus != null),
  };
}

export function useSaleBadge(sale: Sale | null) {
  const result = sale ? getSaleBadge(sale) : null;
  const invalid = result?.diagnostic;
  useEffect(() => {
    if (invalid) console.warn('[sales] INVALID_RESERVATION_STATUS', { id: sale?.id, sourceType: sale?.sourceType });
  }, [invalid, sale?.id, sale?.sourceType, sale?.reservationStatus]);
  return result;
}

export function canUseSaleAction(sale: Sale, action: SaleAction) {
  return sale.allowedActions?.includes(action) === true;
}
