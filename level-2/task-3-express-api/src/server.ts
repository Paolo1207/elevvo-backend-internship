import { createApp } from './app';

const PORT = Number(process.env['PORT'] ?? 3000);

createApp().listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
  console.log('Send the header  x-api-key: secret-key-123  to use /api routes');
});