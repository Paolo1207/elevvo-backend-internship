import { createApp } from './app';
import { config } from './config';
import { seedDemoUsers } from './services/authService';

async function main(): Promise<void> {
  // Create the demo accounts (hashing takes a moment, so finish before accepting requests).
  await seedDemoUsers();

  createApp().listen(config.port, () => {
    console.log(`Server running on http://localhost:${config.port}`);
    console.log('Demo accounts: admin / Admin@12345 (ADMIN)   alice / Alice@12345 (USER)');
    console.log(`Allowed CORS origins: ${config.allowedOrigins.join(', ')}`);
  });
}

main().catch((error: unknown) => {
  console.error('Failed to start server:', error);
  process.exitCode = 1;
});