// Creates (or updates) the first ADMIN account from environment variables. Safe to run again.
//   ADMIN_EMAIL=admin@example.com ADMIN_PASSWORD='a-long-password' npm run seed:admin
// The CI/CD pipeline runs this after the migrations, with the password stored as a GitHub secret.
import bcrypt from 'bcrypt';
import { config } from '../lib/config';
import { disconnectDatabase, prisma } from '../lib/prisma';

async function main(): Promise<void> {
  const email = process.env['ADMIN_EMAIL']?.trim().toLowerCase();
  const password = process.env['ADMIN_PASSWORD'];
  const name = process.env['ADMIN_NAME']?.trim() || 'Administrator';

  if (email === undefined || email === '' || password === undefined || password.length < 8 || Buffer.byteLength(password) > 72) {
    console.log('ADMIN_EMAIL / ADMIN_PASSWORD (8-72 characters) are not set: skipping admin creation.');
    return;
  }

  const passwordHash = await bcrypt.hash(password, config.auth.bcryptRounds);
  const user = await prisma.user.upsert({
    where: { email },
    update: { passwordHash, role: 'ADMIN' },
    create: { email, name, passwordHash, role: 'ADMIN' },
    select: { id: true, email: true, role: true },
  });
  console.log(`Admin ready: ${user.email} (id ${user.id}, role ${user.role})`);
}

main()
  .catch((error: unknown) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await disconnectDatabase();
  });
