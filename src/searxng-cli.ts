/**
 * Executable entry point that runs the asynchronous CLI dispatcher and reports fatal errors consistently.
 */
import { main } from './index';

main().catch((err: Error) => {
  console.error(`Fatal error: ${err.message}`);
  process.exit(1);
});
