import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

type BackfillSummary = {
  reviewed: number;
  updated: number;
  withoutMovements: number;
  omitted: number;
  errors: number;
};

async function main() {
  const summary: BackfillSummary = {
    reviewed: 0,
    updated: 0,
    withoutMovements: 0,
    omitted: 0,
    errors: 0,
  };

  const items = await prisma.item.findMany({
    where: {
      type: 'PRODUCT',
      inventoryMode: 'SIMPLE',
    },
    select: {
      id: true,
      currentStock: true,
      averageCost: true,
    },
    orderBy: { id: 'asc' },
  });

  summary.reviewed = items.length;

  const latestMovements = await prisma.inventoryMovement.findMany({
    where: {
      itemId: { in: items.map((item) => item.id) },
    },
    orderBy: [
      { itemId: 'asc' },
      { occurredAt: 'desc' },
      { createdAt: 'desc' },
    ],
    distinct: ['itemId'],
    select: {
      itemId: true,
      stockAfter: true,
      averageCostAfter: true,
    },
  });

  const movementByItemId = new Map(
    latestMovements.map((movement) => [movement.itemId!, movement]),
  );

  for (const item of items) {
    const movement = movementByItemId.get(item.id);
    if (!movement) {
      summary.withoutMovements += 1;
      if (!item.currentStock.eq(0) || !item.averageCost.eq(0)) {
        try {
          await prisma.item.update({
            where: { id: item.id },
            data: {
              currentStock: 0,
              averageCost: 0,
            },
          });
          summary.updated += 1;
        } catch (error) {
          summary.errors += 1;
          console.error(`[backfill-item-stock] Failed item ${item.id}`, error);
        }
      } else {
        summary.omitted += 1;
      }
      continue;
    }

    if (
      item.currentStock.eq(movement.stockAfter) &&
      item.averageCost.eq(movement.averageCostAfter)
    ) {
      summary.omitted += 1;
      continue;
    }

    try {
      await prisma.item.update({
        where: { id: item.id },
        data: {
          currentStock: movement.stockAfter,
          averageCost: movement.averageCostAfter,
        },
      });
      summary.updated += 1;
    } catch (error) {
      summary.errors += 1;
      console.error(`[backfill-item-stock] Failed item ${item.id}`, error);
    }
  }

  console.log('[backfill-item-stock] Summary');
  console.table(summary);

  if (summary.errors > 0) {
    process.exitCode = 1;
  }
}

main()
  .catch((error) => {
    console.error('[backfill-item-stock] Fatal error', error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
