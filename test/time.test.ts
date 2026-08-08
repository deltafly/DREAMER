/**
 * Timestamp normalisation tests for src/lib/time.ts
 *
 * Framework-free, like the rest of the suite: a plain script that exits
 * non-zero on failure, so it runs under `bun test/time.test.ts` with no test
 * runner and no config.
 *
 * These guard the one property the timeline rests on: every stored timestamp
 * is the same 19-character UTC shape, so that lexicographic ordering — which
 * is all a String column gives us — is also chronological ordering. The
 * supersede chain reads that ordering back to decide which fact replaced
 * which, so a value of the wrong width is a silent correctness bug, not a
 * cosmetic one.
 */

import { normalizeTimestamp, now, toCanonical } from '../src/lib/time';

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

function equals(name: string, actual: unknown, expected: unknown): void {
  const ok = actual === expected;
  if (!ok) console.log(`        got ${JSON.stringify(actual)}, expected ${JSON.stringify(expected)}`);
  check(name, ok);
}

// ===== 1. Canonical shape =====
console.log('\ncanonical shape');

const CANONICAL = /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/;

check('now() is 19 chars, space-separated, second precision', CANONICAL.test(now()));
equals('toCanonical drops the T and the milliseconds',
  toCanonical(new Date('2025-01-15T14:30:00.123Z')), '2025-01-15 14:30:00');

// ===== 2. Accepted input forms =====
console.log('\naccepted forms');

equals('date only becomes midnight UTC',
  normalizeTimestamp('2025-01-15'), '2025-01-15 00:00:00');
equals('space separator, no seconds',
  normalizeTimestamp('2025-01-15 14:30'), '2025-01-15 14:30:00');
equals('space separator, with seconds',
  normalizeTimestamp('2025-01-15 14:30:45'), '2025-01-15 14:30:45');
equals('ISO with T and Z',
  normalizeTimestamp('2025-01-15T14:30:45Z'), '2025-01-15 14:30:45');
equals('ISO with milliseconds',
  normalizeTimestamp('2025-01-15T14:30:45.678Z'), '2025-01-15 14:30:45');
equals('surrounding whitespace is trimmed',
  normalizeTimestamp('  2025-01-15 14:30  '), '2025-01-15 14:30:00');
equals('already-canonical input is a fixed point',
  normalizeTimestamp('2025-01-15 14:30:45'), '2025-01-15 14:30:45');

// This is the specific shape the benchmark harness used to mangle: padEnd(19)
// on a minute-precision string produced "2025-01-15 14:30000", which is not a
// parseable date and sorts after every real timestamp of that minute.
check('minute precision does not turn into a 19-char nonsense string',
  normalizeTimestamp('2025-01-15 14:30') !== '2025-01-15 14:30000');

// ===== 3. Zone handling =====
console.log('\nzone handling');

// A bare timestamp is read as UTC. If it were read as local time, this test
// would fail on any machine whose offset is not zero — which is the drift it
// exists to prevent.
equals('bare timestamp is read as UTC, not local time',
  normalizeTimestamp('2025-06-15 12:00:00'), '2025-06-15 12:00:00');
equals('explicit positive offset is converted to UTC',
  normalizeTimestamp('2025-06-15T12:00:00+02:00'), '2025-06-15 10:00:00');
equals('explicit negative offset is converted to UTC',
  normalizeTimestamp('2025-06-15T12:00:00-05:00'), '2025-06-15 17:00:00');

// ===== 4. Rejected input =====
console.log('\nrejected input');

equals('empty string', normalizeTimestamp(''), null);
equals('whitespace only', normalizeTimestamp('   '), null);
equals('free text', normalizeTimestamp('last tuesday'), null);
equals('wrong separator order', normalizeTimestamp('15-01-2025'), null);
equals('impossible calendar date', normalizeTimestamp('2025-02-31'), null);
equals('impossible month', normalizeTimestamp('2025-13-01'), null);
equals('impossible hour', normalizeTimestamp('2025-01-15 25:00'), null);
equals('SQL fragment', normalizeTimestamp("2025-01-15' OR 1=1--"), null);

// A far-future timestamp would pin itself to the top of every `orderBy ts desc`
// listing forever, so it is refused; ordinary clock skew is not.
const inTenMinutes = toCanonical(new Date(Date.now() + 10 * 60 * 1000));
const inTwoDays = toCanonical(new Date(Date.now() + 2 * 24 * 60 * 60 * 1000));
equals('ten minutes ahead is accepted as clock skew',
  normalizeTimestamp(inTenMinutes), inTenMinutes);
equals('two days ahead is refused', normalizeTimestamp(inTwoDays), null);
equals('year 9999 is refused', normalizeTimestamp('9999-01-01'), null);

// Backdating has no lower bound — importing an archive is the entire point.
equals('a decade-old timestamp is accepted',
  normalizeTimestamp('2015-03-09 08:00:00'), '2015-03-09 08:00:00');

// ===== 5. The ordering property =====
console.log('\nordering property');

const unsorted = [
  '2025-01-15T14:30:45.999Z',
  '2024-12-31 23:59',
  '2025-01-15 09:05:00',
  '2025-01-15',
  '2025-01-15T14:30:45+02:00', // 12:30:45 UTC
];
const normalized = unsorted.map(v => normalizeTimestamp(v));
check('every mixed-form input normalises', normalized.every(v => v !== null));

const lexicographic = [...(normalized as string[])].sort();
const chronological = [...(normalized as string[])].sort(
  (a, b) => new Date(a.replace(' ', 'T') + 'Z').getTime() - new Date(b.replace(' ', 'T') + 'Z').getTime(),
);
check('sorting the strings sorts the timeline',
  JSON.stringify(lexicographic) === JSON.stringify(chronological));
equals('earliest is the new year boundary', lexicographic[0], '2024-12-31 23:59:00');
equals('latest is the millisecond-truncated one', lexicographic[4], '2025-01-15 14:30:45');

// ===== Summary =====
console.log(`\n${passed} passed, ${failures.length} failed`);
if (failures.length > 0) {
  console.log('\nfailures:');
  for (const f of failures) console.log(`  - ${f}`);
  process.exit(1);
}
