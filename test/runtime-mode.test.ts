/**
 * Which environments unlock the development shortcuts.
 *
 * Four separate holes are gated on this one answer: unauthenticated access to
 * workspace 1, MCP without a key, the password reset token returned in the
 * response body, and a NextAuth secret that falls back to a constant published
 * in this repository. Any one of them in front of real data is a full
 * compromise; the gate being wrong opens all four at once.
 *
 * The old test was `NODE_ENV !== 'production'`, which opened everything on an
 * unset variable, an empty string, or `Production` with a capital P — silently,
 * with the service still appearing to work. These cases exist to keep the test
 * positive: development has to say so, and everything else is locked.
 */

import { isDevMode } from '../src/lib/runtime-mode';

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

const saved = process.env.NODE_ENV;

/** Evaluate the gate with NODE_ENV set to a given value (or removed). */
function withNodeEnv(value: string | undefined): boolean {
  if (value === undefined) delete process.env.NODE_ENV;
  else process.env.NODE_ENV = value;
  return isDevMode();
}

// ===== The one value that unlocks =====
console.log('\ndevelopment');

check("'development' unlocks the shortcuts", withNodeEnv('development') === true);

// ===== Everything else must not =====
console.log('\neverything else stays locked');

check("'production' is locked", withNodeEnv('production') === false);
check("'test' is locked", withNodeEnv('test') === false);
check("'staging' is locked", withNodeEnv('staging') === false);

// The cases that used to open everything. Each of these is a plausible
// deployment mistake, not a contrived one.
check('an unset NODE_ENV is locked', withNodeEnv(undefined) === false);
check('an empty NODE_ENV is locked', withNodeEnv('') === false);
check("'Production' with a capital P is locked", withNodeEnv('Production') === false);
check("'prod' is locked", withNodeEnv('prod') === false);
check("'PRODUCTION' is locked", withNodeEnv('PRODUCTION') === false);
check("'Development' with a capital D is locked", withNodeEnv('Development') === false);
check("'dev' is locked", withNodeEnv('dev') === false);
check('a padded value is locked', withNodeEnv(' development ') === false);

// ===== Read per call, not captured at import =====
console.log('\nevaluated per call');

// Module-level capture would freeze whatever was set when the first import ran,
// which is how a test suite can silently disagree with a running server.
withNodeEnv('production');
const locked = isDevMode();
withNodeEnv('development');
const unlocked = isDevMode();
check('the answer follows the current environment, not the import order',
  locked === false && unlocked === true);

if (saved === undefined) delete process.env.NODE_ENV;
else process.env.NODE_ENV = saved;

console.log(`\n${passed} passed, ${failures.length} failed`);
if (failures.length > 0) {
  console.log('\nfailures:');
  for (const f of failures) console.log(`  - ${f}`);
  process.exit(1);
}
