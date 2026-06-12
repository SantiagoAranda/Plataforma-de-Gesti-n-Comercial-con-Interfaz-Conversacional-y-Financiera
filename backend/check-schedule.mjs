import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

const ITEM_ID = 'dc84a143-b3cb-465d-9a79-70294c7dcf72';

try {
  const rows = await prisma.serviceScheduleWindow.findMany({
    where: { itemId: ITEM_ID },
    orderBy: [{ weekday: 'asc' }, { startMinute: 'asc' }],
  });

  console.log('\n=== ServiceScheduleWindow para el servicio ===');
  console.log(`itemId: ${ITEM_ID}\n`);

  if (rows.length === 0) {
    console.log('⚠️  NO HAY VENTANAS GUARDADAS EN LA BASE DE DATOS.');
  } else {
    rows.forEach((r) => {
      const startH = Math.floor(r.startMinute / 60).toString().padStart(2, '0');
      const startM = (r.startMinute % 60).toString().padStart(2, '0');
      const endH   = Math.floor(r.endMinute / 60).toString().padStart(2, '0');
      const endM   = (r.endMinute % 60).toString().padStart(2, '0');
      console.log(
        `  weekday=${r.weekday.padEnd(3)}  startMinute=${r.startMinute} (${startH}:${startM})  endMinute=${r.endMinute} (${endH}:${endM})  itemId=${r.itemId ?? 'GLOBAL'}`,
      );
    });
  }

  // También buscar ventanas globales (itemId: null) para este businessId
  const item = await prisma.item.findUnique({ where: { id: ITEM_ID }, select: { businessId: true } });
  if (item) {
    const globalWindows = await prisma.serviceScheduleWindow.findMany({
      where: { businessId: item.businessId, itemId: null },
      orderBy: [{ weekday: 'asc' }, { startMinute: 'asc' }],
    });
    if (globalWindows.length > 0) {
      console.log('\n=== Ventanas GLOBALES (itemId: null) para este negocio ===');
      globalWindows.forEach((r) => {
        const startH = Math.floor(r.startMinute / 60).toString().padStart(2, '0');
        const startM = (r.startMinute % 60).toString().padStart(2, '0');
        const endH   = Math.floor(r.endMinute / 60).toString().padStart(2, '0');
        const endM   = (r.endMinute % 60).toString().padStart(2, '0');
        console.log(
          `  weekday=${r.weekday.padEnd(3)}  startMinute=${r.startMinute} (${startH}:${startM})  endMinute=${r.endMinute} (${endH}:${endM})`,
        );
      });
    }
  }
} finally {
  await prisma.$disconnect();
}
