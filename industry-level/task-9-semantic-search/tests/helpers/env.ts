// Runs before every test file: no background embedding work, and the offline "hash" provider.
process.env['EMBEDDING_AUTO_INDEX'] = 'false';
process.env['EMBEDDING_WARMUP'] = 'false';
process.env['EMBEDDING_PROVIDER'] = 'hash';
// Tests must never read the developer's real .env file.
process.env['DOTENV_CONFIG_PATH'] = 'does-not-exist.env';