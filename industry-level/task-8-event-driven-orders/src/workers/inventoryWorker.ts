import { topology } from '../messaging/topology';
import { handleInventory } from './inventoryHandler';
import { runWorker } from './runWorker';

runWorker(topology.groups.inventory, (event) => handleInventory(event)).catch((error: unknown) => {
  console.error('Inventory worker failed to start:', error);
  process.exitCode = 1;
});