/**
 * Provider-selection tests for src/lib/llm-client.ts
 *
 * Framework-free, same shape as the other test files. These cover the routing
 * logic only — no network calls are made, so the suite runs with no API keys
 * and no provider reachable.
 *
 * The property under test: a fresh clone picks a working provider from
 * whatever credential happens to be present, and an explicit LLM_PROVIDER
 * always wins over auto-detection.
 */

import { resolveProvider, resolveModel, describeLLM, LLMUnavailableError } from '../src/lib/llm-client';

let passed = 0;
const failures: string[] = [];

function check(name: string, ok: boolean): void {
  if (ok) {
    passed++;
    console.log(`  ok    ${name}`);
  } else {
    failures.push(name);
    console.log(`  FAIL  ${name}`);
  }
}

const LLM_VARS = ['LLM_PROVIDER', 'LLM_MODEL', 'ANTHROPIC_API_KEY', 'OPENAI_API_KEY'] as const;
const saved: Record<string, string | undefined> = {};
for (const key of LLM_VARS) saved[key] = process.env[key];

/** Run `fn` with exactly the given LLM env vars set and the rest cleared. */
function withEnv(env: Partial<Record<(typeof LLM_VARS)[number], string>>, fn: () => void): void {
  for (const key of LLM_VARS) delete process.env[key];
  for (const [key, value] of Object.entries(env)) process.env[key] = value;
  try {
    fn();
  } finally {
    for (const key of LLM_VARS) {
      if (saved[key] === undefined) delete process.env[key];
      else process.env[key] = saved[key];
    }
  }
}

// ===== 1. Auto-detection from credentials =====
console.log('\nprovider auto-detection');

withEnv({ ANTHROPIC_API_KEY: 'sk-ant-test' }, () => {
  check('an Anthropic key selects the anthropic adapter', resolveProvider() === 'anthropic');
});
withEnv({ OPENAI_API_KEY: 'sk-test' }, () => {
  check('an OpenAI key selects the openai adapter', resolveProvider() === 'openai');
});
withEnv({ ANTHROPIC_API_KEY: 'sk-ant-test', OPENAI_API_KEY: 'sk-test' }, () => {
  check('Anthropic wins when both keys are present', resolveProvider() === 'anthropic');
});
withEnv({}, () => {
  check('no credentials falls back to the legacy zai adapter', resolveProvider() === 'zai');
});

// ===== 2. Explicit override =====
console.log('\nexplicit LLM_PROVIDER');

withEnv({ LLM_PROVIDER: 'openai', ANTHROPIC_API_KEY: 'sk-ant-test' }, () => {
  check('an explicit provider overrides auto-detection', resolveProvider() === 'openai');
});
withEnv({ LLM_PROVIDER: 'ANTHROPIC' }, () => {
  check('the provider name is case-insensitive', resolveProvider() === 'anthropic');
});
withEnv({ LLM_PROVIDER: '  zai  ' }, () => {
  check('surrounding whitespace is tolerated', resolveProvider() === 'zai');
});
withEnv({ LLM_PROVIDER: 'nonsense', OPENAI_API_KEY: 'sk-test' }, () => {
  check(
    'an unknown provider name falls back to auto-detection rather than crashing',
    resolveProvider() === 'openai',
  );
});

// ===== 3. Model defaults =====
console.log('\nmodel selection');

withEnv({}, () => {
  check('anthropic defaults to a current Claude model', resolveModel('anthropic').startsWith('claude-'));
  check('openai has its own default', resolveModel('openai') === 'gpt-4o-mini');
  check('zai has its own default', resolveModel('zai') === 'glm-4-flash');
});
withEnv({ LLM_MODEL: 'my-local-model' }, () => {
  check(
    'LLM_MODEL overrides the default for every provider',
    (['anthropic', 'openai', 'zai'] as const).every(p => resolveModel(p) === 'my-local-model'),
  );
});
withEnv({ LLM_MODEL: '   ' }, () => {
  check('a blank LLM_MODEL falls back to the default', resolveModel('openai') === 'gpt-4o-mini');
});

// ===== 4. Reporting =====
console.log('\nreporting and errors');

withEnv({ ANTHROPIC_API_KEY: 'sk-ant-test', LLM_MODEL: 'claude-opus-5' }, () => {
  const described = describeLLM();
  check('describeLLM names the provider', described.includes('anthropic'));
  check('describeLLM names the model', described.includes('claude-opus-5'));
});

const err = new LLMUnavailableError('boom', 'openai');
check('LLMUnavailableError records the provider', err.provider === 'openai');
check('LLMUnavailableError is an Error', err instanceof Error);
check('LLMUnavailableError is catchable by name', err.name === 'LLMUnavailableError');

// ===== Result =====
console.log(`\n${passed} passed, ${failures.length} failed`);
if (failures.length > 0) {
  console.error(`\nFailing checks:\n  - ${failures.join('\n  - ')}`);
  process.exit(1);
}
