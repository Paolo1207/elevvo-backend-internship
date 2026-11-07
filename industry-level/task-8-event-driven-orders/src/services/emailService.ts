// SIMULATED email provider. A real one (SendGrid, SES...) would be an HTTP call that can time out or fail.
// Here we just wait a moment and log the message, so the whole flow can be demonstrated without credentials.
export interface ConfirmationEmail {
  to: string;
  name: string;
  orderId: number;
  total: string;
}

const sleep = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms));

export async function sendOrderConfirmation(email: ConfirmationEmail): Promise<void> {
  await sleep(100); // pretend to call the provider
  console.log(`[email] To: ${email.to} | Hi ${email.name}, we received your order #${email.orderId} (total ${email.total}).`);
}