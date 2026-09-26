export interface ProviderPreset {
  baseUrl: string;
  model: string;
  apiKeyEnv: string;
  requiresApiKey: boolean;
  signupUrl: string;
  cost: 'keyless' | 'free-tier' | 'paid';
}

export const OPENAI_COMPATIBLE_PRESETS: Record<string, ProviderPreset> = {
  pollinations: {
    baseUrl: 'https://text.pollinations.ai/openai',
    model: 'openai-fast',
    apiKeyEnv: 'POLLINATIONS_API_KEY',
    requiresApiKey: false,
    signupUrl: 'https://pollinations.ai',
    cost: 'keyless',
  },
  groq: {
    baseUrl: 'https://api.groq.com/openai/v1',
    model: 'openai/gpt-oss-120b',
    apiKeyEnv: 'GROQ_API_KEY',
    requiresApiKey: true,
    signupUrl: 'https://console.groq.com/keys',
    cost: 'free-tier',
  },
  openrouter: {
    baseUrl: 'https://openrouter.ai/api/v1',
    model: 'meta-llama/llama-3.3-70b-instruct:free',
    apiKeyEnv: 'OPENROUTER_API_KEY',
    requiresApiKey: true,
    signupUrl: 'https://openrouter.ai/keys',
    cost: 'free-tier',
  },
  gemini: {
    baseUrl: 'https://generativelanguage.googleapis.com/v1beta/openai',
    model: 'gemini-2.0-flash',
    apiKeyEnv: 'GEMINI_API_KEY',
    requiresApiKey: true,
    signupUrl: 'https://aistudio.google.com/apikey',
    cost: 'free-tier',
  },
  xai: {
    baseUrl: 'https://api.x.ai/v1',
    model: 'grok-3-mini',
    apiKeyEnv: 'XAI_API_KEY',
    requiresApiKey: true,
    signupUrl: 'https://console.x.ai',
    cost: 'paid',
  },
  openai: {
    baseUrl: 'https://api.openai.com/v1',
    model: 'gpt-4o-mini',
    apiKeyEnv: 'OPENAI_API_KEY',
    requiresApiKey: true,
    signupUrl: 'https://platform.openai.com/api-keys',
    cost: 'paid',
  },
};
