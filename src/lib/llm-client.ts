import { logger } from '@/lib/logger';

/**
 * Provider-agnostic LLM client.
 *
 * Every model call in OneBrainer goes through `complete()`. The Librarian,
 * the Dreamer and the benchmark judge do not know which provider is serving
 * them — they hand over a system prompt, a user prompt, and a token budget.
 *
 * Three adapters ship in the box:
 *
 *   anthropic — the official @anthropic-ai/sdk (Claude)
 *   openai    — any OpenAI-compatible /chat/completions endpoint, which covers
 *               OpenAI, Groq, OpenRouter, Together, vLLM and Ollama
 *   zai       — the z-ai-web-dev-sdk this project was originally built against,
 *               kept so existing deployments keep working
 *
 * Selection is env-driven (see .env.example). With nothing configured the
 * client auto-detects from whichever API key is present, so a fresh clone runs
 * as soon as one key is exported.
 */

export type LLMProvider = 'anthropic' | 'openai' | 'zai';

/** Reasoning depth. Mapped per provider; ignored by providers without the concept. */
export type LLMEffort = 'low' | 'medium' | 'high';

export interface LLMRequest {
  /** Instructions. Sent as the system prompt on every provider. */
  system: string;
  /** The payload to work on. */
  user: string;
  /**
   * Hard ceiling on the reply. Generous by default: on Claude this budget
   * covers thinking *and* answer text, so a tight value truncates mid-JSON.
   */
  maxTokens?: number;
  /**
   * Reasoning depth. Claude maps this to `output_config.effort`; the
   * OpenAI-compatible and z-ai adapters ignore it.
   */
  effort?: LLMEffort;
  /**
   * Sampling temperature. Applied by the OpenAI-compatible and z-ai adapters
   * only — current Claude models reject sampling parameters with a 400, so the
   * Anthropic adapter deliberately drops it rather than erroring.
   */
  temperature?: number;
  /** Label used in logs to identify the call site. */
  context: string;
}

export interface LLMResponse {
  text: string;
  provider: LLMProvider;
  model: string;
}

/** Raised when the provider is unreachable, unconfigured, or returns nothing usable. */
export class LLMUnavailableError extends Error {
  constructor(message: string, readonly provider: LLMProvider | 'none') {
    super(message);
    this.name = 'LLMUnavailableError';
  }
}

const DEFAULT_MAX_TOKENS = 16_000;

const DEFAULT_MODELS: Record<LLMProvider, string> = {
  // Current flagship. Override with LLM_MODEL.
  anthropic: 'claude-opus-5',
  openai: 'gpt-4o-mini',
  zai: 'glm-4-flash',
};

/**
 * Resolve the active provider, or null when nothing is configured.
 *
 * An explicit LLM_PROVIDER always wins. Otherwise the first configured
 * credential decides, so `export ANTHROPIC_API_KEY=...` is the entire setup
 * for a fresh clone. `OPENAI_BASE_URL` alone is enough too — local servers
 * (Ollama, vLLM) don't need a key.
 *
 * `zai` is never auto-selected: it is a sandbox-specific SDK that cannot work
 * outside the environment this project was first built in. Falling back to it
 * would turn "you forgot to set an API key" into an unrelated import error, so
 * it must be requested explicitly with LLM_PROVIDER=zai.
 */
export function resolveProvider(): LLMProvider | null {
  const explicit = process.env.LLM_PROVIDER?.trim().toLowerCase();
  if (explicit) {
    if (explicit === 'anthropic' || explicit === 'openai' || explicit === 'zai') return explicit;
    logger.warn('Unknown LLM_PROVIDER — falling back to auto-detection', { value: explicit });
  }

  if (process.env.ANTHROPIC_API_KEY) return 'anthropic';
  if (process.env.OPENAI_API_KEY || process.env.OPENAI_BASE_URL) return 'openai';
  return null;
}

export function resolveModel(provider: LLMProvider): string {
  return process.env.LLM_MODEL?.trim() || DEFAULT_MODELS[provider];
}

// ===== Anthropic =====

let _anthropic: import('@anthropic-ai/sdk').default | null = null;

async function getAnthropic() {
  if (!_anthropic) {
    const { default: Anthropic } = await import('@anthropic-ai/sdk');
    // The constructor reads ANTHROPIC_API_KEY (and the `ant auth login`
    // profile) from the environment on its own — don't pass a key explicitly.
    _anthropic = new Anthropic();
  }
  return _anthropic;
}

async function completeAnthropic(req: LLMRequest, model: string): Promise<string> {
  const client = await getAnthropic();

  const response = await client.messages.create({
    model,
    max_tokens: req.maxTokens ?? DEFAULT_MAX_TOKENS,
    system: req.system,
    messages: [{ role: 'user', content: req.user }],
    // Adaptive thinking is on by default on current Claude models; naming it
    // keeps behaviour identical on the previous generation too.
    thinking: { type: 'adaptive' },
    output_config: { effort: req.effort ?? 'low' },
    // req.temperature is intentionally NOT forwarded: current Claude models
    // reject temperature/top_p/top_k with a 400.
  });

  // A safety classifier can decline the request. That arrives as a normal
  // 200 with an empty content array, so check before reading blocks.
  if (response.stop_reason === 'refusal') {
    throw new LLMUnavailableError(
      `Claude declined the request (${response.stop_details?.category ?? 'unspecified'})`,
      'anthropic',
    );
  }

  return response.content
    .filter((block): block is Extract<typeof block, { type: 'text' }> => block.type === 'text')
    .map(block => block.text)
    .join('');
}

// ===== OpenAI-compatible =====

/**
 * Plain fetch against /chat/completions. No SDK, because the point of this
 * adapter is to work against every server that speaks the same shape —
 * OpenAI, Groq, OpenRouter, Together, vLLM, Ollama.
 */
async function completeOpenAI(req: LLMRequest, model: string): Promise<string> {
  const baseUrl = (process.env.OPENAI_BASE_URL?.trim() || 'https://api.openai.com/v1').replace(/\/+$/, '');
  const apiKey = process.env.OPENAI_API_KEY;

  if (!apiKey) {
    // Local servers (Ollama, vLLM) usually accept any placeholder, so this is
    // a warning rather than a hard failure.
    logger.warn('OPENAI_API_KEY is not set — sending an unauthenticated request', { baseUrl });
  }

  const response = await fetch(`${baseUrl}/chat/completions`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(apiKey ? { Authorization: `Bearer ${apiKey}` } : {}),
    },
    body: JSON.stringify({
      model,
      max_tokens: req.maxTokens ?? DEFAULT_MAX_TOKENS,
      ...(req.temperature === undefined ? {} : { temperature: req.temperature }),
      messages: [
        { role: 'system', content: req.system },
        { role: 'user', content: req.user },
      ],
    }),
  });

  if (!response.ok) {
    const detail = await response.text().catch(() => '');
    throw new LLMUnavailableError(
      `OpenAI-compatible endpoint returned ${response.status}: ${detail.slice(0, 200)}`,
      'openai',
    );
  }

  const body = (await response.json()) as {
    choices?: { message?: { content?: string } }[];
  };
  return body.choices?.[0]?.message?.content ?? '';
}

// ===== z-ai (legacy) =====

let _zai: Awaited<ReturnType<typeof import('z-ai-web-dev-sdk').default.create>> | null = null;

async function getZAI() {
  if (!_zai) {
    // Lazy import — the SDK is an optional dependency, and pulling it in at
    // module eval time also caused a TDZ crash under Turbopack.
    const mod = await import('z-ai-web-dev-sdk');
    _zai = await mod.default.create();
  }
  return _zai;
}

async function completeZAI(req: LLMRequest): Promise<string> {
  const zai = await getZAI();
  const response = await zai.chat.completions.create({
    messages: [
      { role: 'system', content: req.system },
      { role: 'user', content: req.user },
    ],
    ...(req.temperature === undefined ? {} : { temperature: req.temperature }),
  });
  return response.choices?.[0]?.message?.content ?? '';
}

// ===== Entry point =====

/**
 * Run one completion against the configured provider.
 *
 * Throws `LLMUnavailableError` when the provider is unreachable, unconfigured
 * or declined the request. Callers are expected to degrade rather than fail:
 * the Librarian falls back to heuristic extraction, the Dreamer skips the
 * batch, the benchmark judge scores zero.
 */
export async function complete(req: LLMRequest): Promise<LLMResponse> {
  const provider = resolveProvider();
  if (!provider) {
    throw new LLMUnavailableError(
      'No LLM provider is configured. Set ANTHROPIC_API_KEY, or OPENAI_API_KEY ' +
        '(or OPENAI_BASE_URL alone for a local server such as Ollama), or pin one ' +
        'explicitly with LLM_PROVIDER. See .env.example.',
      'none',
    );
  }

  const model = resolveModel(provider);
  const started = Date.now();

  try {
    let text: string;
    switch (provider) {
      case 'anthropic':
        text = await completeAnthropic(req, model);
        break;
      case 'openai':
        text = await completeOpenAI(req, model);
        break;
      case 'zai':
        text = await completeZAI(req);
        break;
    }

    logger.debug('LLM call completed', {
      context: req.context,
      provider,
      model,
      ms: Date.now() - started,
      chars: text.length,
    });

    return { text, provider, model };
  } catch (error) {
    if (error instanceof LLMUnavailableError) throw error;

    const message = error instanceof Error ? error.message : String(error);
    logger.warn('LLM call failed', { context: req.context, provider, model, error: message });
    throw new LLMUnavailableError(`${provider} call failed: ${message}`, provider);
  }
}

/** Provider and model in effect, for health checks and run summaries. */
export function describeLLM(): string {
  const provider = resolveProvider();
  if (!provider) return 'not configured';
  return `${provider} (${resolveModel(provider)})`;
}
