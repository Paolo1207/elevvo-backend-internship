/** @type {import('jest').Config} */
module.exports = {
  testEnvironment: 'node',
  roots: ['<rootDir>/tests'],
  testMatch: ['**/*.test.ts'],
  transform: {
    '^.+\\.ts$': ['ts-jest', { tsconfig: 'tsconfig.test.json' }],
  },
  // The TypeScript build rewrites './file.ts' imports to './file.js'. Jest runs the .ts sources directly,
  // so '.js' is mapped back to the extension-less path and Jest finds the .ts file.
  moduleNameMapper: { '^(\\.{1,2}/.*)\\.js$': '$1' },
  clearMocks: true,
  // Coverage quality gate: `npm run test:ci` fails if coverage drops below these numbers.
  collectCoverageFrom: [
    'src/**/*.ts',
    '!src/generated/**',
    '!src/server.ts',
    '!src/scripts/**',
    '!src/lib/redis.ts',
    '!src/lib/prisma.ts',
  ],
  coverageThreshold: {
    global: { statements: 80, branches: 70, functions: 80, lines: 80 },
  },
};