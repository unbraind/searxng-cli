import { main } from './index';

main().catch((err: Error) => {
  console.error(`Fatal error: ${err.message}`);
  process.exit(1);
});
