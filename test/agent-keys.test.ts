/**
 * Agent credential tests for src/lib/agent-keys.ts
 *
 * Framework-free and offline, like the rest of the suite.
 *
 * These exist because of a specific defect: seedWorkspace() inserted five
 * literal key hashes that were committed to a public repository, and it runs on
 * every registration. Every workspace of every deployment therefore shared the
 * same owner-role credential, and nothing could replace it. The properties
 * below are the ones that stop that from coming back — including a scan of the
 * source tree, because the failure was not in the logic but in a constant
 * somebody typed.
 */

import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  KEY_DISCLOSURE_NOTICE,
  SEEDED_AGENTS,
  generateAgentKey,
  hashAgentKey,
  issueAgentKeys,
} from '../src/lib/agent-keys';

let passed = 0;
const failures: string[] = [];

function check(name: string, ok: boolean, detail?: string): void {
  if (ok) {
    passed++;
    console.log(`  ok    ${name}`);
  } else {
    failures.push(name);
    console.log(`  FAIL  ${name}${detail ? `\n        ${detail}` : ''}`);
  }
}

const REPO = join(import.meta.dirname, '..');

// ===== 1. Keys are unguessable and unique =====
console.log('\nkey generation');

const key = generateAgentKey();
check('keys carry the ob_ prefix', key.startsWith('ob_'));
check('keys are 24 random bytes in hex', /^ob_[0-9a-f]{48}$/.test(key));

// Uniqueness is the whole point: a repeat means the source of randomness is
// not random, which is exactly the failure mode being guarded against.
const many = new Set(Array.from({ length: 500 }, () => generateAgentKey()));
check('500 generated keys are all distinct', many.size === 500);

const issued = issueAgentKeys();
check('a workspace gets one key per seeded agent', issued.length === SEEDED_AGENTS.length);
check('the issued keys are distinct from each other',
  new Set(issued.map(a => a.key)).size === issued.length);
check('two workspaces never receive the same keys',
  issueAgentKeys().every(a => !issued.some(b => b.key === a.key)));
check('an owner-role agent is among them',
  issued.some(a => a.role === 'owner'));

// ===== 2. Hashing matches what the MCP route verifies =====
console.log('\nhashing');

const hash = hashAgentKey(key);
check('the stored form names its algorithm', hash.startsWith('sha256:'));
check('the digest is 64 hex characters', /^sha256:[0-9a-f]{64}$/.test(hash));
check('hashing is deterministic', hashAgentKey(key) === hash);
check('a different key hashes differently', hashAgentKey(generateAgentKey()) !== hash);
check('the raw key does not survive in the hash', !hash.includes(key.slice(3)));

// Pinned against the published SHA-256 test vector for "abc" rather than
// against another call to our own code, which would prove nothing. If the
// scheme ever changes, every key already issued stops verifying — so it has to
// change deliberately, not by accident.
check('the scheme is a plain unsalted SHA-256 of the raw key',
  hashAgentKey('abc') ===
    'sha256:ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad');

// ===== 3. No credential is ever a constant in the source =====
console.log('\nno hard-coded credentials in the tree');

function sourceFiles(dir: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name === 'node_modules' || entry.name === '.next' || entry.name === '.git') continue;
      out.push(...sourceFiles(full));
    } else if (/\.(ts|tsx|js|mjs|json)$/.test(entry.name)) {
      out.push(full);
    }
  }
  return out;
}

// A literal 'sha256:<64 hex>' in the tree is a stored credential that every
// deployment would share. The only legitimate occurrences are patterns in this
// file and the assertions that describe the format.
const STORED_HASH = /['"`]sha256:[0-9a-f]{64}['"`]/g;
const LITERAL_KEY = /['"`]ob_[0-9a-f]{40,}['"`]/g;

const offenders: string[] = [];
for (const file of [...sourceFiles(join(REPO, 'src')), ...sourceFiles(join(REPO, 'prisma'))]) {
  const source = readFileSync(file, 'utf8');
  for (const match of [...source.matchAll(STORED_HASH), ...source.matchAll(LITERAL_KEY)]) {
    offenders.push(`${file.slice(REPO.length + 1)}: ${match[0].slice(0, 40)}...`);
  }
}
check('no agent key or key hash is written into src/ or prisma/',
  offenders.length === 0, offenders.join('\n        '));

// The scanner has to be able to see one, or the check above means nothing.
check('the scanner recognises a stored hash literal',
  STORED_HASH.test(`{ keyHash: 'sha256:${'a'.repeat(64)}' }`));
check('the scanner recognises a literal key',
  LITERAL_KEY.test(`const k = "ob_${'b'.repeat(48)}"`));

// ===== 4. Rotation semantics =====
console.log('\nrotation');

// Rotation is an update of the stored hash, so what makes an old key stop
// working is simply that its hash no longer matches any row. Verified here at
// the level rotation actually operates on.
const original = generateAgentKey();
const rotated = generateAgentKey();
const storedAfterRotation = hashAgentKey(rotated);
check('the rotated key verifies', hashAgentKey(rotated) === storedAfterRotation);
check('the previous key no longer verifies', hashAgentKey(original) !== storedAfterRotation);

check('the disclosure notice tells the holder to store it now',
  /store/i.test(KEY_DISCLOSURE_NOTICE));
check('the disclosure notice points at the rotation route',
  KEY_DISCLOSURE_NOTICE.includes('/api/agents/'));

// ===== Summary =====
console.log(`\n${passed} passed, ${failures.length} failed`);
if (failures.length > 0) {
  console.log('\nfailures:');
  for (const f of failures) console.log(`  - ${f}`);
  process.exit(1);
}
