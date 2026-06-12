const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
  const b = await prisma.business.findFirst();
  console.log(b.slug);
}

main().finally(() => prisma.$disconnect());
