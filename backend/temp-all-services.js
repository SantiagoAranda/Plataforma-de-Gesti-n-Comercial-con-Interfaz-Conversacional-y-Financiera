const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
  const items = await prisma.item.findMany({
    where: { type: 'SERVICE' },
    select: {
      id: true,
      name: true,
      scheduleWindows: {
        select: {
          weekday: true,
          startMinute: true,
          endMinute: true
        }
      }
    }
  });

  console.log(JSON.stringify(items, null, 2));
}

main().catch(console.error).finally(() => prisma.$disconnect());
