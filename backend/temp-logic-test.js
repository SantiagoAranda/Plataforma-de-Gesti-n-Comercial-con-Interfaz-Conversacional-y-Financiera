const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

function getWeekday(date) {
  const weekdayMap = {
    0: 'SUN',
    1: 'MON',
    2: 'TUE',
    3: 'WED',
    4: 'THU',
    5: 'FRI',
    6: 'SAT',
  };
  return weekdayMap[date.getUTCDay()];
}

async function main() {
  const businessId = 'c9b52cbd-1814-4552-b096-88b878e7f805';
  const itemId = 'dc84a143-b3cb-465d-9a79-70294c7dcf72';
  
  // Create a date for Thursday, June 18, 2026 UTC
  const thursdayDate = new Date(Date.UTC(2026, 5, 18, 0, 0, 0, 0));
  
  const weekday = getWeekday(thursdayDate);
  console.log(`Checking for weekday: ${weekday}`);

  const windows = await prisma.serviceScheduleWindow.findMany({
    where: {
      businessId,
      weekday,
      itemId,
    },
    orderBy: { startMinute: 'asc' },
  });

  console.log('Windows for THU in DB:', JSON.stringify(windows, null, 2));
}

main().catch(console.error).finally(() => prisma.$disconnect());
