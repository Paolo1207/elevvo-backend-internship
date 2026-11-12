// Runs before every test file: no background embedding work, the offline "hash" provider, cheap bcrypt,
// a fixed JWT secret, and the developer's real .env is never read.
process.env['EMBEDDING_AUTO_INDEX'] = 'false';
process.env['EMBEDDING_WARMUP'] = 'false';
process.env['EMBEDDING_PROVIDER'] = 'hash';
process.env['DOTENV_CONFIG_PATH'] = 'does-not-exist.env';
process.env['JWT_SECRET'] = 'test-secret-test-secret-test-secret-123456';
process.env['BCRYPT_ROUNDS'] = '4';
process.env['ALLOWED_ORIGINS'] = 'http://localhost:5173';
