import { topology } from '../messaging/topology';
import { handleEmail } from './emailHandler';
import { runWorker } from './runWorker';

runWorker(topology.groups.email, (event) => handleEmail(event)).catch((error: unknown) => {
  console.error('Email worker failed to start:', error);
  process.exitCode = 1;
});