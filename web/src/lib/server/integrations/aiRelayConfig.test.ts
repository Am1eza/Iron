// @vitest-environment node
/**
 * Provider migrations (owner decisions): DeepSeek → Parspack AI Studio →
 * Surplus Intelligence (`gpt-5.6-luna`, 1405/06).
 *
 * Two properties are load-bearing here and both are easy to break silently:
 *   1. the LEGACY `DEEPSEEK_*` names keep working, because the live `.env`
 *      still uses them and the container must not die the moment this lands;
 *   2. reasoning effort is ALWAYS capped, because the Parspack model that
 *      previously held this default spent ~95% of its tokens thinking
 *      unconstrained and could not finish a tool round trip inside
 *      AI_TIMEOUT_MS — which is exactly how production broke. Kept capped for
 *      Surplus too even though it measured `reasoning_tokens: 0` at `low`.
 */
import { describe, it, expect } from 'vitest';
import {
  aiApiKey,
  aiBaseUrl,
  aiModel,
  aiFallbackApiKey,
  aiFallbackBaseUrl,
  aiFallbackModel,
  reasoningEffort,
  DEFAULT_AI_MODEL,
} from './aiRelayConfig';

const env = (o: Record<string, string>) => o as unknown as NodeJS.ProcessEnv;

describe('provider-neutral names, with a legacy fallback', () => {
  it('prefers the modern name', () => {
    const e = env({ AI_API_KEY: 'new', DEEPSEEK_API_KEY: 'old', AI_BASE_URL: 'https://new/v1', DEEPSEEK_BASE_URL: 'https://old/v1' });
    expect(aiApiKey(e)).toBe('new');
    expect(aiBaseUrl(e)).toBe('https://new/v1');
  });

  it('falls back to the DEEPSEEK_* names — the live .env still uses them', () => {
    const e = env({ DEEPSEEK_API_KEY: 'old', DEEPSEEK_BASE_URL: 'https://ai.parspack.com/v1', DEEPSEEK_MODEL: 'm' });
    expect(aiApiKey(e)).toBe('old');
    expect(aiBaseUrl(e)).toBe('https://ai.parspack.com/v1');
    expect(aiModel(e)).toBe('m');
  });

  it('treats an EMPTY value as unset, not as a value', () => {
    // docker-compose passes absent optional vars as `${VAR:-}`, so '' is the
    // normal spelling of "not set" here — preferring it over a populated
    // legacy name would silently disable the relay.
    const e = env({ AI_API_KEY: '', DEEPSEEK_API_KEY: 'old', AI_BASE_URL: '   ', DEEPSEEK_BASE_URL: 'https://old/v1' });
    expect(aiApiKey(e)).toBe('old');
    expect(aiBaseUrl(e)).toBe('https://old/v1');
  });

  it('defaults to the model the owner asked for, and no other', () => {
    expect(aiModel(env({}))).toBe(DEFAULT_AI_MODEL);
    expect(DEFAULT_AI_MODEL).toBe('gpt-5.6-luna');
  });

  it('resolves the fallback relay the same way', () => {
    expect(aiFallbackBaseUrl(env({ FALLBACK_BASE_URL: 'https://fb/v1' }))).toBe('https://fb/v1');
    expect(aiFallbackApiKey(env({ AI_FALLBACK_API_KEY: 'k', FALLBACK_API_KEY: 'old' }))).toBe('k');
    // No fallback model configured → the primary model, not a stale default.
    expect(aiFallbackModel(env({ AI_MODEL: 'primary' }))).toBe('primary');
    expect(aiFallbackModel(env({ AI_MODEL: 'primary', FALLBACK_MODEL: 'other' }))).toBe('other');
  });

  it('reports nothing configured as undefined rather than an empty string', () => {
    expect(aiApiKey(env({}))).toBeUndefined();
    expect(aiBaseUrl(env({}))).toBeUndefined();
    expect(aiFallbackBaseUrl(env({}))).toBeUndefined();
  });
});

describe('reasoning effort is always capped', () => {
  it('defaults to low — the measured level where tool calling still fires', () => {
    expect(reasoningEffort(env({}))).toBe('low');
  });

  it('honours an explicit level', () => {
    for (const level of ['none', 'low', 'medium', 'high'] as const) {
      expect(reasoningEffort(env({ AI_REASONING_EFFORT: level }))).toBe(level);
    }
    expect(reasoningEffort(env({ AI_REASONING_EFFORT: 'LOW' }))).toBe('low');
  });

  it('`off` omits the parameter entirely (for a provider that rejects it)', () => {
    expect(reasoningEffort(env({ AI_REASONING_EFFORT: 'off' }))).toBeUndefined();
  });

  it('a TYPO falls back to low, never to unconstrained', () => {
    // The failure mode being guarded: a misspelling that quietly restores the
    // behaviour which timed out every answer in production.
    for (const raw of ['lo', 'default', 'maximum', '', '   ']) {
      expect(reasoningEffort(env({ AI_REASONING_EFFORT: raw }))).toBe('low');
    }
  });
});
