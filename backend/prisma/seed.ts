import { config } from 'dotenv';
import { resolve } from 'node:path';
import { createPrismaClient } from '../src/prisma/create-prisma-client';

config({ path: resolve(__dirname, '../../.env') });

const main = async (): Promise<void> => {
  const prisma = createPrismaClient();
  await prisma.$connect();
  await prisma.$disconnect();
  console.log('Seed completed (no demo data). Settings defaults are created on backend startup.');
};

main().catch((error: unknown) => {
  console.error(error);
  process.exit(1);
});
