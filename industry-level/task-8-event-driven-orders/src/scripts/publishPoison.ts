// Publishes a deliberately broken message, to demonstrate the Dead Letter Queue.
// It can never be processed (no valid event), so the workers send it to the DLQ immediately.
//   npm run publish:poison
import { connectRedis, disconnectRedis, redis } from '../lib/redis';
import { ensureGroups } from '../messaging/publisher';
import { topology } from '../messaging/topology';

async function main(): Promise<void> {
  if (!(await connectRedis())) throw new Error('Redis is not reachable');
  await ensureGroups();
  const id = await redis.xAdd(topology.stream, '*', { payload: '{"type":"OrderCreated","oops": this is not json' });
  console.log(`Published poison message ${id}. Check GET /api/dead-letters in a few seconds.`);
  await disconnectRedis();
}

main().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});