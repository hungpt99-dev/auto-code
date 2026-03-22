export const TASK_TYPES = [
  {
    id: 'code',
    icon: '💻',
    label: 'Generate Code',
    desc: 'Implement the feature or change described in the issue',
    color: '#3b82f6',
  },
  {
    id: 'explain',
    icon: '📖',
    label: 'Explain Business',
    desc: 'Break down requirements, data flow, and affected components',
    color: '#8b5cf6',
  },
  {
    id: 'bug',
    icon: '🐛',
    label: 'Trace Bug',
    desc: 'Find root cause via repo structure, produce minimal fix + tests',
    color: '#ef4444',
  },
  {
    id: 'review',
    icon: '🔍',
    label: 'Code Review',
    desc: 'Review repos for bugs, security (OWASP), performance, quality',
    color: '#f59e0b',
  },
  {
    id: 'test',
    icon: '🧪',
    label: 'Write Tests',
    desc: 'Generate unit + integration tests, edge cases, mocks',
    color: '#10b981',
  },
  {
    id: 'docs',
    icon: '📝',
    label: 'Write Docs',
    desc: 'Generate technical docs, API reference, README',
    color: '#6366f1',
  },
  {
    id: 'refactor',
    icon: '♻️',
    label: 'Refactor',
    desc: 'SOLID principles, reduce complexity, improve readability',
    color: '#06b6d4',
  },
];

export const TASK_TYPE_MAP = Object.fromEntries(TASK_TYPES.map((t) => [t.id, t]));

/** Task types where language/stack selection is meaningful */
export const LANG_AWARE_TASK_TYPES = new Set(['code', 'bug', 'test', 'refactor']);
