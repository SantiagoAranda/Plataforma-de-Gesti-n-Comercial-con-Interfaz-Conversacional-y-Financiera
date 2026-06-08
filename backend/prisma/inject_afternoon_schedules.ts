import { PrismaClient, Weekday } from "@prisma/client";

const prisma = new PrismaClient();

const WEEKDAYS: Weekday[] = ["MON", "TUE", "WED", "THU", "FRI"];
const START_MINUTE = 840; // 14:00
const END_MINUTE = 1080;  // 18:00

async function main() {
  const business = await prisma.business.findUnique({
    where: { slug: "tecnogames" },
    include: {
      items: {
        where: { type: "SERVICE" }
      }
    }
  });

  if (!business) {
    console.error("Business 'tecnogames' not found. Make sure the database is running and populated.");
    return;
  }

  console.log(`Injecting afternoon windows for business: ${business.name} (ID: ${business.id})`);

  let createdCount = 0;

  // 1. Create global afternoon windows (itemId: null)
  for (const weekday of WEEKDAYS) {
    const existing = await prisma.serviceScheduleWindow.findFirst({
      where: {
        businessId: business.id,
        itemId: null,
        weekday,
        startMinute: START_MINUTE,
        endMinute: END_MINUTE,
      }
    });

    if (!existing) {
      await prisma.serviceScheduleWindow.create({
        data: {
          businessId: business.id,
          itemId: null,
          weekday,
          startMinute: START_MINUTE,
          endMinute: END_MINUTE,
        }
      });
      createdCount++;
    }
  }

  // 2. Create item-specific afternoon windows for all services
  for (const item of business.items) {
    for (const weekday of WEEKDAYS) {
      const existing = await prisma.serviceScheduleWindow.findFirst({
        where: {
          businessId: business.id,
          itemId: item.id,
          weekday,
          startMinute: START_MINUTE,
          endMinute: END_MINUTE,
        }
      });

      if (!existing) {
        await prisma.serviceScheduleWindow.create({
          data: {
            businessId: business.id,
            itemId: item.id,
            weekday,
            startMinute: START_MINUTE,
            endMinute: END_MINUTE,
          }
        });
        createdCount++;
      }
    }
  }

  console.log(`Successfully injected/verified afternoon windows. Created ${createdCount} new records.`);
}

main()
  .catch((e) => {
    console.error("Failed to inject afternoon schedules:", e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
