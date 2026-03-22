/**
 * AI provider definitions.
 * Strategy pattern — each provider has the same interface so the rest of the
 * app can swap between them without any if/else chains outside this file.
 */

export const AI_PROVIDERS = [
  {
    id: 'openai',
    name: 'OpenAI',
    icon: '🧠',
    description: 'GPT-4o — best overall code quality',
    models: [
      { id: 'gpt-4o',          name: 'GPT-4o (recommended)' },
      { id: 'gpt-4-turbo',     name: 'GPT-4 Turbo' },
      { id: 'gpt-3.5-turbo',   name: 'GPT-3.5 Turbo (fast / cheap)' },
    ],
    defaultModel: 'gpt-4o',
    settingKey: 'openaiKey',
    apiUrl: 'https://platform.openai.com/api-keys',
  },
  {
    id: 'claude',
    name: 'Anthropic Claude',
    icon: '🤖',
    description: 'Claude 3.5 Sonnet — excellent at code & long-form reasoning',
    models: [
      { id: 'claude-3-5-sonnet-20241022', name: 'Claude 3.5 Sonnet (recommended)' },
      { id: 'claude-3-opus-20240229',     name: 'Claude 3 Opus (most capable)' },
      { id: 'claude-3-haiku-20240307',    name: 'Claude 3 Haiku (fast)' },
    ],
    defaultModel: 'claude-3-5-sonnet-20241022',
    settingKey: 'claudeKey',
    apiUrl: 'https://console.anthropic.com',
  },
  {
    id: 'gemini',
    name: 'Google Gemini',
    icon: '✨',
    description: 'Gemini 1.5 Pro — 1 M token context window',
    models: [
      { id: 'gemini-1.5-pro',    name: 'Gemini 1.5 Pro (recommended)' },
      { id: 'gemini-2.0-flash',  name: 'Gemini 2.0 Flash (latest / fast)' },
      { id: 'gemini-1.5-flash',  name: 'Gemini 1.5 Flash (fast / cheap)' },
    ],
    defaultModel: 'gemini-1.5-pro',
    settingKey: 'geminiKey',
    apiUrl: 'https://aistudio.google.com/apikey',
  },
];

/** Lookup by id — O(1) */
export const PROVIDER_MAP = Object.fromEntries(AI_PROVIDERS.map((p) => [p.id, p]));

/**
 * Ordered generation steps shown in the progress UI.
 * Timing is simulated client-side while n8n + AI is running.
 */
export const GENERATION_STEPS = [
  { id: 'connect',   label: 'Connecting to n8n' },
  { id: 'jira',      label: 'Fetching Jira issue details' },
  { id: 'analyze',   label: 'Analysing requirements' },
  { id: 'plan',      label: 'Planning architecture' },
  { id: 'implement', label: 'Generating source files' },
  { id: 'tests',     label: 'Writing unit tests' },
  { id: 'patch',     label: 'Building diff patch' },
  { id: 'done',      label: 'Finalising output' },
];

/** Cumulative ms at which each step "completes" during the wait */
export const STEP_TIMINGS_MS = [600, 3000, 5500, 9000, 16000, 22000, 27000, 31000];
