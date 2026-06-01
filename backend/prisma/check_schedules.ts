import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  const business = await prisma.business.findUnique({
    where: { slug: "tecnogames" },
    include: {
      items: {
        where: { type: "SERVICE" }
      },
      schedules: true
    }
  });

  if (!business) {
    console.log("Business 'tecnogames' not found");
    return;
  }

  console.log("Business:", business.name, "ID:", business.id);
  console.log("Services:");
  for (const item of business.items) {
    console.log(`  - ID: ${item.id} | Name: ${item.name} | Duration: ${item.durationMinutes}`);
  }
  
  console.log("Current Schedule Windows:");
  for (const w of business.schedules) {
    console.log(`  - Day: ${w.weekday} | Start: ${w.startMinute} (${Math.floor(w.startMinute/60)}:${w.startMinute%60}) | End: ${w.endMinute} (${Math.floor(w.endMinute/60)}:${w.endMinute%60}) | ItemId: ${w.itemId}`);
  }
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
