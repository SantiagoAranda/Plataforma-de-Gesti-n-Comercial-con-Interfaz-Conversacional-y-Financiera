/* Read-only report. It never updates or deletes accounting movements. */
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

try {
  const rows = await prisma.accountingMovement.findMany({
    where: {
      originType: { in: ['PAYROLL_RUN', 'PAYROLL_PAYMENT'] },
    },
    orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
  });

  const groups = new Map();
  for (const row of rows) {
    const metadata = row.metadata && typeof row.metadata === 'object' ? row.metadata : {};
    const key = JSON.stringify({
      businessId: row.businessId,
      originType: row.originType,
      originId: row.originId,
      accountingRole: row.accountingRole ?? metadata.accountingRole ?? null,
      account: row.pucSubcuentaId ?? row.pucCuentaCode ?? null,
      side: row.nature,
      amount: String(row.amount),
      employeeId: metadata.employeeId ?? null,
      payrollRunId: metadata.payrollRunId ?? null,
      payrollPeriodId: metadata.payrollPeriodId ?? null,
      accountingStage: metadata.accountingStage ?? null,
    });
    groups.set(key, [...(groups.get(key) ?? []), row]);
  }

  const duplicates = [...groups.values()]
    .filter((group) => group.length > 1)
    .map((group) => ({
      canonicalId: group[0].id,
      duplicateIds: group.slice(1).map((row) => row.id),
      originType: group[0].originType,
      originId: group[0].originId,
      account: group[0].pucSubcuentaId ?? group[0].pucCuentaCode,
      side: group[0].nature,
      amount: String(group[0].amount),
    }));

  console.log(JSON.stringify({ scanned: rows.length, duplicateGroups: duplicates }, null, 2));
  console.log('-- Proposed cleanup SQL is intentionally not executed.');
  for (const item of duplicates) {
    console.log(`-- DELETE FROM "AccountingMovement" WHERE "id" IN (${item.duplicateIds.map((id) => `'${id}'`).join(', ')});`);
  }
} finally {
  await prisma.$disconnect();
}
