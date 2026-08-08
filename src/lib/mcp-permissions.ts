/**
 * Role gating for MCP tools.
 *
 * Most MCP tools read knowledge and are safe for any authenticated caller.
 * A few do not: `run_dreamer` and `run_librarian` kick off LLM pipelines that
 * spend tokens, mutate the knowledge base and hold a task lock, so a worker
 * key that was only meant to ingest and query should not be able to trigger
 * them. Everything here is pure so it can be tested without a database.
 */

/** Agent roles issued to machine callers (`Agent.role`). */
export const AGENT_ROLES = ['owner', 'orchestrator', 'librarian', 'worker'] as const;
/** Workspace roles held by human callers (`WorkspaceMember.role`). */
export const WORKSPACE_ROLES = ['owner', 'admin', 'member'] as const;

/**
 * Tools that start a pipeline rather than answer a question, mapped to the
 * roles allowed to call them. A tool absent from this map is unrestricted.
 */
const PRIVILEGED_TOOLS: Record<string, readonly string[]> = {
  // Cross-topic generation: expensive, and writes sparks + associations.
  run_dreamer: ['owner', 'admin', 'orchestrator'],
  // Extraction: writes facts, decisions and disputes. The dedicated
  // `librarian` agent role exists precisely to run this one.
  run_librarian: ['owner', 'admin', 'orchestrator', 'librarian'],
};

export function isPrivilegedTool(tool: string): boolean {
  return Object.prototype.hasOwnProperty.call(PRIVILEGED_TOOLS, tool);
}

/** Roles permitted to call `tool`, or null when the tool is unrestricted. */
export function allowedRolesFor(tool: string): readonly string[] | null {
  return PRIVILEGED_TOOLS[tool] ?? null;
}

export interface ToolAccessDecision {
  allowed: boolean;
  /** Human-readable reason, populated only when `allowed` is false. */
  reason?: string;
}

/**
 * Decide whether a caller may invoke a tool.
 *
 * `role` is the agent's role for key-authenticated callers, the workspace
 * membership role for session-authenticated ones, and null when neither is
 * known. A null role is refused for privileged tools unless `isDev` is set —
 * the same development fallback the workspace resolver uses, so local
 * curl/Postman testing keeps working while production stays closed.
 */
export function checkToolAccess(
  tool: string,
  role: string | null | undefined,
  isDev = false,
): ToolAccessDecision {
  const allowed = allowedRolesFor(tool);
  if (!allowed) return { allowed: true };

  if (!role) {
    if (isDev) return { allowed: true };
    return {
      allowed: false,
      reason: `Tool "${tool}" requires an authenticated caller with one of: ${allowed.join(', ')}`,
    };
  }

  if (allowed.includes(role)) return { allowed: true };

  return {
    allowed: false,
    reason: `Role "${role}" may not call "${tool}". Allowed roles: ${allowed.join(', ')}`,
  };
}
