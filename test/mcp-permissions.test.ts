/**
 * Role-gate tests for src/lib/mcp-permissions.ts
 *
 * Same framework-free shape as llm-safety.test.ts: a plain script that exits
 * non-zero on failure, runnable with `bun ./test/mcp-permissions.test.ts`.
 *
 * The property under test: tools that start an LLM pipeline (spending tokens
 * and mutating the knowledge base) are reachable only by roles that should be
 * able to trigger them, while read-only tools stay open to every caller.
 */

import {
  checkToolAccess,
  isPrivilegedTool,
  allowedRolesFor,
  AGENT_ROLES,
  WORKSPACE_ROLES,
} from '../src/lib/mcp-permissions';

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

// ===== 1. Read-only tools stay open =====
console.log('\nread-only tools');

const READ_ONLY = [
  'brain_query', 'add_fact', 'list_topics', 'get_brief', 'get_neural_stats',
  'get_knowledge_gaps', 'get_insights', 'get_associations', 'get_graph',
  'list_decisions', 'list_sparks',
];

check(
  'no read-only tool is treated as privileged',
  READ_ONLY.every(tool => !isPrivilegedTool(tool)),
);
check(
  'every role may call every read-only tool',
  READ_ONLY.every(tool =>
    [...AGENT_ROLES, ...WORKSPACE_ROLES].every(role => checkToolAccess(tool, role).allowed),
  ),
);
check(
  'an unauthenticated caller may still call read-only tools in production',
  READ_ONLY.every(tool => checkToolAccess(tool, null, false).allowed),
);
check(
  'an unknown tool name is not accidentally privileged',
  checkToolAccess('some_future_tool', 'worker').allowed,
);

// ===== 2. Pipeline tools are gated =====
console.log('\nprivileged tools');

check('run_dreamer is privileged', isPrivilegedTool('run_dreamer'));
check('run_librarian is privileged', isPrivilegedTool('run_librarian'));

check(
  'a worker agent key cannot run the dreamer',
  checkToolAccess('run_dreamer', 'worker').allowed === false,
);
check(
  'a worker agent key cannot run the librarian',
  checkToolAccess('run_librarian', 'worker').allowed === false,
);
check(
  'a plain workspace member cannot run the dreamer',
  checkToolAccess('run_dreamer', 'member').allowed === false,
);

check('an owner may run the dreamer', checkToolAccess('run_dreamer', 'owner').allowed);
check('an orchestrator may run the dreamer', checkToolAccess('run_dreamer', 'orchestrator').allowed);
check('a workspace admin may run the dreamer', checkToolAccess('run_dreamer', 'admin').allowed);

check(
  'the dedicated librarian role may run the librarian',
  checkToolAccess('run_librarian', 'librarian').allowed,
);
check(
  'but the librarian role may NOT run the dreamer',
  checkToolAccess('run_dreamer', 'librarian').allowed === false,
);

// ===== 3. Unauthenticated callers =====
console.log('\nunauthenticated callers');

check(
  'a null role is refused for privileged tools in production',
  checkToolAccess('run_librarian', null, false).allowed === false,
);
check(
  'an empty-string role is refused too (not treated as a valid role)',
  checkToolAccess('run_librarian', '', false).allowed === false,
);
check(
  'an undefined role is refused in production',
  checkToolAccess('run_dreamer', undefined, false).allowed === false,
);
check(
  'the development fallback allows a null role',
  checkToolAccess('run_dreamer', null, true).allowed,
);
check(
  'the development fallback does NOT rescue an explicitly insufficient role',
  checkToolAccess('run_dreamer', 'worker', true).allowed === false,
);

// ===== 4. Refusals explain themselves =====
console.log('\nrefusal messages');

const denied = checkToolAccess('run_dreamer', 'worker');
check('a refusal carries a reason', typeof denied.reason === 'string' && denied.reason.length > 0);
check('the reason names the offending role', denied.reason?.includes('worker') === true);
check('the reason lists the allowed roles', denied.reason?.includes('orchestrator') === true);
check(
  'an allowed decision carries no reason',
  checkToolAccess('run_dreamer', 'owner').reason === undefined,
);
check(
  'allowedRolesFor returns null for unrestricted tools',
  allowedRolesFor('brain_query') === null,
);

// ===== Result =====
console.log(`\n${passed} passed, ${failures.length} failed`);
if (failures.length > 0) {
  console.error(`\nFailing checks:\n  - ${failures.join('\n  - ')}`);
  process.exit(1);
}
