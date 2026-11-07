// OPERATIONS endpoints: look at the queues, inspect/replay the Dead Letter Queue, trigger failures for demos.
// NOTE: these are NOT protected by authentication to keep the exercise simple. In production they would
// sit behind admin authentication or an internal network only.
import type { Request, Response } from 'express';
import { AppError } from '../lib/errors';
import { isRecord, queryPositiveInt } from '../lib/validation';
import { getChaos, isChaosService, setChaos } from '../messaging/chaos';
import { deleteDeadLetter, listDeadLetters, queueStats, replayDeadLetter } from '../messaging/deadLetters';

// Redis stream ids look like 1730981234567-0
function parseStreamId(raw: string | undefined): string {
  if (raw === undefined || !/^\d+-\d+$/.test(raw)) {
    throw new AppError(400, '"id" must be a stream id such as 1730981234567-0');
  }
  return raw;
}

export async function getDeadLetters(req: Request, res: Response): Promise<void> {
  const limit = Math.min(queryPositiveInt(req.query['limit'], 'limit') ?? 50, 200);
  const data = await listDeadLetters(limit);
  res.status(200).json({ meta: { count: data.length }, data });
}

export async function replayDeadLetterById(req: Request, res: Response): Promise<void> {
  const result = await replayDeadLetter(parseStreamId(req.params['id']));
  res.status(202).json({ data: result });
}

export async function discardDeadLetter(req: Request, res: Response): Promise<void> {
  await deleteDeadLetter(parseStreamId(req.params['id']));
  res.status(204).send();
}

export async function getQueueStats(_req: Request, res: Response): Promise<void> {
  res.status(200).json({ data: await queueStats() });
}

export async function getChaosSettings(_req: Request, res: Response): Promise<void> {
  res.status(200).json({ data: await getChaos() });
}

// POST /api/admin/chaos  { "service": "email", "mode": "always" | "off" | 3 }
export async function updateChaos(req: Request, res: Response): Promise<void> {
  const body: unknown = req.body;
  if (!isRecord(body) || !isChaosService(body['service'])) {
    throw new AppError(400, '"service" must be "email" or "inventory"');
  }
  const mode = body['mode'];
  const valid = mode === 'always' || mode === 'off' || (typeof mode === 'number' && Number.isInteger(mode) && mode >= 1 && mode <= 100);
  if (!valid) {
    throw new AppError(400, '"mode" must be "always", "off", or a number of failures from 1 to 100');
  }
  await setChaos(body['service'], mode as 'always' | 'off' | number);
  res.status(200).json({ data: await getChaos() });
}