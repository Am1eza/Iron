/**
 * System-prompt versioning + A/B assignment (US-05.5).
 *
 * CACHE NOTE: DeepSeek caches on the byte-identical prefix of the message
 * list (see conversation.ts's CACHE NOTE). A/B testing necessarily trades
 * ONE shared cache prefix for up to N per-version prefixes — each version's
 * text must itself stay byte-identical across requests, which it does here
 * (it's a static settings value, not re-generated per request). This is the
 * standard, well-understood cost of prompt A/B testing over a cached
 * prefix — not a bug, but real, which is why it's opt-in (empty/one-version
 * settings = feature fully off, zero cache impact) rather than always-on.
 */
import { getSetting } from '@/lib/server/repos/settingsRepo';
import { AI_SYSTEM_PROMPT } from '@/lib/server/services/aiTools';

export interface PromptVersion {
  id: string;
  label: string;
  prompt: string;
}

interface AiPromptVersionsSetting {
  versions: PromptVersion[];
}

/** Configured versions, or [] when unset/only one version exists — both
 *  mean "A/B is off, always use the baseline AI_SYSTEM_PROMPT". */
export async function getPromptVersions(): Promise<PromptVersion[]> {
  const setting = await getSetting<AiPromptVersionsSetting>('AI_PROMPT_VERSIONS', { versions: [] });
  return setting.versions.length >= 2 ? setting.versions : [];
}

/** djb2 — fast, deterministic, non-cryptographic. This is a load-balancing
 *  bucket hash, not a security boundary, so a simple string hash is enough
 *  (no need for node:crypto here). */
function stableHash(input: string): number {
  let hash = 5381;
  for (let i = 0; i < input.length; i++) {
    hash = (hash * 33) ^ input.charCodeAt(i);
  }
  return hash >>> 0; // unsigned
}

/** Deterministically pick a version id for a conversation id — same
 *  conversation always lands on the same version (AC1). Returns null when
 *  A/B is off (fewer than 2 versions), meaning "use the baseline prompt". */
export function assignPromptVersion(conversationId: string, versions: PromptVersion[]): string | null {
  if (versions.length < 2) return null;
  const idx = stableHash(conversationId) % versions.length;
  return versions[idx]!.id;
}

/** The actual text to send as the system prompt for a resolved
 *  (possibly null) version id. Always falls back to the baseline —
 *  a versionId that no longer matches any configured version (e.g. an
 *  admin removed it after some conversations were already assigned) never
 *  leaves the advisor with no system prompt at all. */
export function resolvePromptText(versionId: string | null | undefined, versions: PromptVersion[]): string {
  if (!versionId) return AI_SYSTEM_PROMPT;
  return versions.find((v) => v.id === versionId)?.prompt ?? AI_SYSTEM_PROMPT;
}
