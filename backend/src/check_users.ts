
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function test() {
  const users = await prisma.user.findMany({
    select: { id: true, username: true, telegramId: true }
  });
  console.log('Current Users in DB:');
  console.table(users);
}

test()
  .catch(e => console.error(e))
  .finally(() => prisma.$disconnect());
