import 'dotenv/config';

import { runAgent } from './agent/run';

async function main() {
  const userMessage = process.argv[2];

  if (!userMessage) {
    console.error('Usage: npm run dev -- "Your message"');
    process.exit(1);
  }

  const response = await runAgent(userMessage);

  console.log(response);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});