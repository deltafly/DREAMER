import { createHash, randomBytes } from 'node:crypto';

/**
 * Agent API keys.
 *
 * An agent key is what an MCP client presents to act on a workspace, so it is a
 * credential with the same weight as a password — and it is checked by hash
 * lookup, exactly like one.
 *
 * This module exists because the seeding path used to insert a fixed set of
 * hashes that were committed to the repository. Every workspace on every
 * deployment therefore shared the same owner-role credential, and there was no
 * way to replace it. A constant in a public repository is not a secret; it is a
 * shared one, and a shared secret is only as strong as the least careful place
 * it has ever been written down.
 *
 * The rules that follow from that:
 *
 *   Keys are generated per workspace, never declared in source.
 *   The raw key is shown exactly once, at the moment it is created.
 *   Only the hash is stored, and the hash is never served over the API.
 *   Any key can be replaced without touching the database by hand.
 */

/** Recognisable prefix, so a leaked key is identifiable in logs and pastes. */
const KEY_PREFIX = 'ob_';

/**
 * 24 bytes — 192 bits of entropy.
 *
 * The stored form is an unsalted SHA-256, which is the right choice for a
 * high-entropy random key (it has to be a plain lookup, and there is nothing to
 * brute-force) and the wrong one for anything guessable. That is precisely why
 * the raw key must always come from here and never from a human.
 */
const KEY_BYTES = 24;

/** The agents every new workspace starts with, and what each may do. */
export const SEEDED_AGENTS: { agentId: string; role: string }[] = [
  { agentId: 'claude-web', role: 'owner' },
  { agentId: 'claude-code', role: 'worker' },
  { agentId: 'orchestrator', role: 'orchestrator' },
  { agentId: 'glm-worker-1', role: 'worker' },
  { agentId: 'librarian', role: 'librarian' },
];

/** A fresh key. Random, unguessable, and never derived from anything. */
export function generateAgentKey(): string {
  return `${KEY_PREFIX}${randomBytes(KEY_BYTES).toString('hex')}`;
}

/**
 * The stored form of a key.
 *
 * The `sha256:` prefix is part of the stored value, not decoration — it marks
 * which algorithm produced the digest, so the scheme can change later without
 * every existing row becoming ambiguous.
 */
export function hashAgentKey(rawKey: string): string {
  return `sha256:${createHash('sha256').update(rawKey).digest('hex')}`;
}

export interface IssuedAgentKey {
  agentId: string;
  role: string;
  /** Plaintext. Returned once, never stored, never retrievable again. */
  key: string;
}

/** Generate the starting set of keys for a new workspace. */
export function issueAgentKeys(): IssuedAgentKey[] {
  return SEEDED_AGENTS.map(agent => ({ ...agent, key: generateAgentKey() }));
}

/**
 * The sentence shown alongside a freshly issued key.
 *
 * Kept here rather than written out at each call site so every path that hands
 * a key to someone says the same thing about it.
 */
export const KEY_DISCLOSURE_NOTICE =
  'Store these now — only their hashes are kept, so they cannot be shown again. ' +
  'Lost or exposed keys are replaced with POST /api/agents/{id}/rotate.';
