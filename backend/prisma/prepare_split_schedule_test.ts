import { PrismaClient, Weekday } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  const business = await prisma.business.findUnique({
    where: { slug: "tecnogames" },
  });

  if (!business) {
    console.error("Business 'tecnogames' not found");
    return;
  }

  // 1. Delete all existing Monday schedule windows for this business
  await prisma.serviceScheduleWindow.deleteMany({
    where: {
      businessId: business.id,
      weekday: "MON",
    }
  });

  // 2. Create or update 90-minute service
  let service90 = await prisma.item.findFirst({
    where: {
      businessId: business.id,
      name: "Servicio Largo 90 min",
      type: "SERVICE",
    }
  });

  if (!service90) {
    service90 = await prisma.item.create({
      data: {
        businessId: business.id,
        name: "Servicio Largo 90 min",
        type: "SERVICE",
        price: 600,
        durationMinutes: 90,
        status: "ACTIVE",
      }
    });
    console.log("Created 90-minute service:", service90.id);
  } else {
    console.log("Found existing 90-minute service:", service90.id);
  }

  // Get all services including the 30 min one
  const services = await prisma.item.findMany({
    where: {
      businessId: business.id,
      type: "SERVICE",
      status: "ACTIVE"
    }
  });

  // 3. Create split windows for MON:
  // - Morning: 08:00 - 12:00 (480 - 720)
  // - Afternoon: 16:00 - 18:00 (960 - 1080)
  const windowsToCreate = [
    { start: 480, end: 720 },
    { start: 960, end: 1080 },
  ];

  // Global windows
  for (const win of windowsToCreate) {
    await prisma.serviceScheduleWindow.create({
      data: {
        businessId: business.id,
        itemId: null,
        weekday: "MON",
        startMinute: win.start,
        endMinute: win.end,
      }
    });
  }

  // Item-specific windows for all services
  for (const svc of services) {
    for (const win of windowsToCreate) {
      await prisma.serviceScheduleWindow.create({
        data: {
          businessId: business.id,
          itemId: svc.id,
          weekday: "MON",
          startMinute: win.start,
          endMinute: win.end,
        }
      });
    }
  }

  console.log("Successfully prepared split schedule on MON (8:00-12:00, 16:00-18:00) for all services.");
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
