// Fills the database with sample data. Safe to run more than once.
import { prisma } from '../src/lib/prisma';

async function main(): Promise<void> {
  const users = [
    { email: 'ada@example.com', name: 'Ada Lovelace' },
    { email: 'alan@example.com', name: 'Alan Turing' },
    { email: 'grace@example.com', name: 'Grace Hopper' },
  ];

  for (const user of users) {
    await prisma.user.upsert({ where: { email: user.email }, update: {}, create: user });
  }

  if ((await prisma.product.count()) === 0) {
    await prisma.product.createMany({
      data: [
        { name: 'Wireless Mouse', description: 'Ergonomic 2.4GHz mouse', price: '24.99', stock: 50 },
        { name: 'Mechanical Keyboard', description: 'Blue switches, full size', price: '89.90', stock: 20 },
        { name: 'USB-C Hub', description: '7-in-1 adapter', price: '39.50', stock: 35 },
        { name: '27" Monitor', description: '1440p IPS display', price: '299.00', stock: 8 },
        { name: 'Laptop Stand', description: 'Adjustable aluminium stand', price: '34.00', stock: 40 },
        { name: 'Webcam HD', description: '1080p with microphone', price: '59.99', stock: 15 },
        { name: 'Desk Mat', description: 'Large felt desk mat', price: '19.99', stock: 100 },
        { name: 'Noise-Cancelling Headphones', description: 'Over-ear, 30h battery', price: '199.00', stock: 5 },
      ],
    });
  }

  console.log(
    `Seeded: ${await prisma.user.count()} users, ${await prisma.product.count()} products`,
  );
}

main()
  .catch((error: unknown) => {
    console.error('Seeding failed:', error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());