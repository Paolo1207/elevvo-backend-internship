import { createApp } from './app';
import { prisma } from './lib/prisma';

const PORT = Number(process.env['PORT'] ?? 3000);

const server = createApp().listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
});

// Close the HTTP server and the database connections cleanly on Ctrl+C.
async function shutdown(): Promise<void> {
  server.close();
  await prisma.$disconnect();
  process.exit(0);
}

process.on('SIGINT', () => void shutdown());
process.on('SIGTERM', () => void shutdown());