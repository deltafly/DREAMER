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

import { resolveProvider, resolveModel, describeLLM, complete, LLMUnavailableError } from '../src/lib/llm-client';

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

const LLM_VARS = [
  'LLM_PROVIDER', 'LLM_MODEL', 'ANTHROPIC_API_KEY', 'OPENAI_API_KEY', 'OPENAI_BASE_URL',
] as const;
const saved: Record<string, string | undefined> = {};
for (const key of LLM_VARS) saved[key] = process.env[key];

/** Run `fn` with exactly the given LLM env vars set and the rest cleared. */
function withEnv(env: Partial<Record<(typeof LLM_VARS)[number], string>>, fn: () => void): void {
  for (const key of LLM_VARS) delete process.env[key];
  for (const [key, value] of Object.entries(env)) process.env[key] = value;
  try {
    fn();
  } finally {
    restoreEnv();
  }
}

/** Async variant of {@link withEnv}, for checks that await a call. */
async function withEnvAsync(
  env: Partial<Record<(typeof LLM_VARS)[number], string>>,
  fn: () => Promise<void>,
): Promise<void> {
  for (const key of LLM_VARS) delete process.env[key];
  for (const [key, value] of Object.entries(env)) process.env[key] = value;
  try {
    await fn();
  } finally {
    restoreEnv();
  }
}

function restoreEnv(): void {
  for (const key of LLM_VARS) {
    if (saved[key] === undefined) delete process.env[key];
    else process.env[key] = saved[key];
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
withEnv({ OPENAI_BASE_URL: 'http://localhost:11434/v1' }, () => {
  check(
    'a base URL alone selects openai (local servers need no key)',
    resolveProvider() === 'openai',
  );
});
withEnv({}, () => {
  check('no credentials resolves to null rather than a provider', resolveProvider() === null);
});
withEnv({}, () => {
  check(
    'the sandbox-only zai adapter is never auto-selected',
    resolveProvider() !== 'zai',
  );
});
withEnv({ LLM_PROVIDER: 'zai' }, () => {
  check('zai is reachable only when asked for explicitly', resolveProvider() === 'zai');
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
withEnv({ LLM_PROVIDER: 'nonsense' }, () => {
  check(
    'an unknown provider name with no credentials resolves to null',
    resolveProvider() === null,
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
withEnv({}, () => {
  check('describeLLM reports an unconfigured client plainly', describeLLM() === 'not configured');
});

// An unconfigured client must say what is missing rather than failing somewhere
// deeper with an unrelated import or network error.
await withEnvAsync({}, async () => {
  let message = '';
  try {
    await complete({ context: 'test', system: 's', user: 'u' });
  } catch (error) {
    message = error instanceof Error ? error.message : String(error);
  }
  check('complete() refuses when nothing is configured', message.length > 0);
  check('the message names ANTHROPIC_API_KEY', message.includes('ANTHROPIC_API_KEY'));
  check('the message names OPENAI_API_KEY', message.includes('OPENAI_API_KEY'));
  check('the message points at .env.example', message.includes('.env.example'));
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
