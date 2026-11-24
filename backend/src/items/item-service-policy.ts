import { BadRequestException, ConflictException } from '@nestjs/common';
import { Prisma } from '@prisma/client';

type ServicePolicy = { type?: string; requiresAppointment?: boolean };
export const requiresAppointment = (item: ServicePolicy) =>
  item.type === 'SERVICE' && item.requiresAppointment !== false;

export function assertAppointmentService(item: ServicePolicy) {
  if (!requiresAppointment(item))
    throw new ConflictException({
      code: 'SERVICE_WITHOUT_APPOINTMENT',
      message:
        'Este servicio no requiere agenda. Añádelo a una venta sin fecha ni horario.',
    });
}

/** SHARE conflicts with configuration UPDATE, but not with concurrent bookings.
 * Keep the lock until the writer commits; acquire multiple items in stable order.
 * Do not lock reservation rows here: their existing lifecycle lock order is preserved.
 */
export async function lockItemConfiguration(
  tx: Prisma.TransactionClient,
  businessId: string,
  itemIds: string[],
  exclusive = false,
) {
  const ids = [...new Set(itemIds)].sort();
  if (!ids.length) return;
  await tx.$queryRaw(Prisma.sql`
    SELECT id FROM "Item" WHERE "businessId" = ${businessId} AND id IN (${Prisma.join(ids)})
    ORDER BY id ${exclusive ? Prisma.sql`FOR UPDATE` : Prisma.sql`FOR SHARE`}
  `);
}

export function servicePolicyData(
  type: string,
  input: { requiresAppointment?: boolean; allowWalkIn?: boolean },
  previous?: { requiresAppointment?: boolean; allowWalkIn?: boolean },
) {
  if (type !== 'SERVICE') {
    if (input.requiresAppointment === true || input.allowWalkIn === true)
      throw new BadRequestException(
        'Los productos no admiten configuración de agenda.',
      );
    return { requiresAppointment: false, allowWalkIn: false };
  }
  return {
    requiresAppointment:
      input.requiresAppointment ?? previous?.requiresAppointment ?? true,
    allowWalkIn: input.allowWalkIn ?? previous?.allowWalkIn ?? true,
  };
}

export function assertReservableSchedule(
  duration: number | null | undefined,
  windows: Array<{ weekday: string; startMinute: number; endMinute: number }>,
) {
  const days = ['MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT', 'SUN'];
  if (
    !Number.isInteger(duration) ||
    duration! <= 0 ||
    duration! > 1440 ||
    !windows.length ||
    windows.some(
      (w) =>
        !days.includes(w.weekday) ||
        !Number.isInteger(w.startMinute) ||
        !Number.isInteger(w.endMinute) ||
        w.startMinute < 0 ||
        w.endMinute > 1440 ||
        w.startMinute >= w.endMinute,
    ) ||
    !windows.some((w) => w.endMinute - w.startMinute >= duration!)
  ) {
    throw new BadRequestException({
      code: 'SERVICE_SCHEDULE_REQUIRED',
      message:
        'Configura una duración y al menos una franja que permita reservar el servicio.',
    });
  }
  for (const day of days) {
    const sorted = windows
      .filter((w) => w.weekday === day)
      .sort((a, b) => a.startMinute - b.startMinute);
    if (sorted.some((w, i) => i > 0 && w.startMinute < sorted[i - 1].endMinute))
      throw new BadRequestException(
        'Las franjas de atención no pueden superponerse.',
      );
  }
}

/** One commercial order can mix products and non-appointment services only. */
export function assertUnscheduledItems(items: ServicePolicy[]) {
  if (items.some(requiresAppointment))
    throw new ConflictException({
      code: 'APPOINTMENT_REQUIRES_SEPARATE_BOOKING',
      message: 'Los servicios con agenda deben reservarse por separado.',
    });
}
