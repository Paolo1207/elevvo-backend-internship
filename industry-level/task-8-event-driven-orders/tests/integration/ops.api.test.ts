import request from 'supertest';
import { createApp } from '../../src/app';
import { setChaos } from '../../src/messaging/chaos';
import { deleteDeadLetter, listDeadLetters, queueStats, replayDeadLetter } from '../../src/messaging/deadLetters';
import { resetMocks } from '../helpers/mocks';

jest.mock('../../src/lib/prisma', () => require('../helpers/mocks').prismaModule());
jest.mock('../../src/lib/redis', () => require('../helpers/mocks').redisModule());
jest.mock('../../src/middleware/rateLimiter', () => ({
  createApiLimiter: () => (_req: unknown, _res: unknown, next: () => void) => next(),
}));
jest.mock('../../src/messaging/deadLetters');
jest.mock('../../src/messaging/chaos', () => ({
  ...jest.requireActual('../../src/messaging/chaos'),
  getChaos: jest.fn().mockResolvedValue({ email: 'off', inventory: 'off' }),
  setChaos: jest.fn().mockResolvedValue(undefined),
}));

const app = createApp();

beforeEach(() => resetMocks());

describe('operations endpoints', () => {
  it('GET /api/dead-letters lists the DLQ', async () => {
    (listDeadLetters as jest.Mock).mockResolvedValue([{ id: '1-0' }]);
    const res = await request(app).get('/api/dead-letters?limit=500');
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ meta: { count: 1 }, data: [{ id: '1-0' }] });
    expect(listDeadLetters).toHaveBeenCalledWith(200); // capped
  });

  it('POST /api/dead-letters/:id/replay answers 202', async () => {
    (replayDeadLetter as jest.Mock).mockResolvedValue({ replayedAs: '9-0', group: 'email' });
    const res = await request(app).post('/api/dead-letters/5-0/replay');
    expect(res.status).toBe(202);
    expect(res.body.data).toEqual({ replayedAs: '9-0', group: 'email' });
  });

  it('rejects ids that are not stream ids', async () => {
    expect((await request(app).post('/api/dead-letters/abc/replay')).status).toBe(400);
    expect((await request(app).delete('/api/dead-letters/abc')).status).toBe(400);
  });

  it('DELETE /api/dead-letters/:id answers 204', async () => {
    const res = await request(app).delete('/api/dead-letters/5-0');
    expect(res.status).toBe(204);
    expect(deleteDeadLetter).toHaveBeenCalledWith('5-0');
  });

  it('GET /api/stats/queues returns the stats', async () => {
    (queueStats as jest.Mock).mockResolvedValue({ streamLength: 3 });
    const res = await request(app).get('/api/stats/queues');
    expect(res.body.data).toEqual({ streamLength: 3 });
  });

  it('GET and POST /api/admin/chaos', async () => {
    expect((await request(app).get('/api/admin/chaos')).body.data).toEqual({ email: 'off', inventory: 'off' });
    expect((await request(app).post('/api/admin/chaos').send({ service: 'email', mode: 3 })).status).toBe(200);
    expect(setChaos).toHaveBeenCalledWith('email', 3);
  });

  it.each([
    [{ service: 'sms', mode: 'always' }],
    [{ service: 'email', mode: 'sometimes' }],
    [{ service: 'email', mode: 0 }],
    [[]],
  ])('POST /api/admin/chaos rejects %j', async (payload) => {
    expect((await request(app).post('/api/admin/chaos').send(payload)).status).toBe(400);
  });
});