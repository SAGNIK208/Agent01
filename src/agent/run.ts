import { generateText } from 'ai';

import { createSelectedModel } from '../providers/registry';

export async function runAgent(userMessage: string): Promise<string> {
  const model = createSelectedModel();
  console.log('Calling selected model...');
  const result = await generateText({
    model,
    prompt: userMessage,
    timeout: 30000
  });

  return result.text;
}