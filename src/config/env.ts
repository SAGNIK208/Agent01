import 'dotenv/config'

type AIProvider = 'google' | 'anthropic' | 'openai'

type EnvConfig = {
  provider: AIProvider;
  apiKey: string;
};

const keyNames: Record<AIProvider, string> = {
  google: 'GOOGLE_GENERATIVE_AI_API_KEY',
  openai: 'OPENAI_API_KEY',
  anthropic: 'ANTHROPIC_API_KEY',
};

function loadEnv(): EnvConfig {
  const provider = process.env.AI_PROVIDER?.trim();

  if (
    provider !== 'google' &&
    provider !== 'openai' &&
    provider !== 'anthropic'
  ){
    throw new Error(
        'AI_Provider must be one of google | openai | anthropic'
    );
  }

  const keyName = keyNames[provider];
  const apiKey = process.env[keyName]?.trim();

  if (!apiKey) {
    throw new Error(
        `${keyName} is required when AI_PROVIDER=${provider}.`
    )
  }

  return {provider,apiKey};

}

export const env = loadEnv();