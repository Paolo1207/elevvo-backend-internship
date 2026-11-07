// EMAIL WORKER logic: send the "we received your order" email.
// IDEMPOTENT: confirmationEmailSentAt remembers that the email went out, so a duplicate delivery
// does not email the customer twice.
import { prisma } from '../lib/prisma';
import { maybeInjectFailure } from '../messaging/chaos';
import { NonRetryableError } from '../messaging/errors';
import type { OrderCreatedEvent } from '../messaging/events';
import { sendOrderConfirmation } from '../services/emailService';

export async function handleEmail(event: OrderCreatedEvent): Promise<void> {
  const { orderId } = event.data;
  const order = await prisma.order.findUnique({
    where: { id: orderId },
    include: { user: { select: { email: true, name: true } } },
  });
  if (order === null) throw new NonRetryableError(`Order ${orderId} does not exist`);
  if (order.confirmationEmailSentAt !== null) return; // already sent

  await maybeInjectFailure('email'); // lets us simulate "the email service is down"
  await sendOrderConfirmation({
    to: order.user.email,
    name: order.user.name,
    orderId: order.id,
    total: order.total.toString(),
  });

  await prisma.order.update({ where: { id: orderId }, data: { confirmationEmailSentAt: new Date() } });
}