import { createAnthropic } from '@ai-sdk/anthropic';
import { createGoogle } from '@ai-sdk/google';
import { createOpenAI } from '@ai-sdk/openai';
import type { LanguageModel } from 'ai';

import { env } from '../config/env';

const defaultModels = {
  google: 'gemini-3.5-flash-lite',
  openai: 'gpt-4.1-mini',
  anthropic: 'claude-haiku-4-5',
} as const;

function createGoogleModel(apiKey: string) {
  const google = createGoogle({ apiKey });

  return google(defaultModels.google);
}

function createOpenAIModel(apiKey: string) {
  const openai = createOpenAI({ apiKey });

  return openai(defaultModels.openai);
}

function createAnthropicModel(apiKey: string) {
  const anthropic = createAnthropic({ apiKey });

  return anthropic(defaultModels.anthropic);
}

export function createSelectedModel(): LanguageModel {
  switch (env.provider) {
    case 'google':
      return createGoogleModel(env.apiKey);
    case 'openai':
      return createOpenAIModel(env.apiKey);
    case 'anthropic':
      return createAnthropicModel(env.apiKey);
    default: {
      const _exhaustiveCheck: never = env.provider;
      throw new Error(`Unsupported provider: ${_exhaustiveCheck}`);
    }  
  }
}