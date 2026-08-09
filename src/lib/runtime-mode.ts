import { logger } from '@/lib/logger';

/**
 * Whether the development conveniences are active.
 *
 * Several of them are, by design, holes: unauthenticated access to workspace 1,
 * MCP without a key, the password reset token returned in the response body,
 * and a NextAuth secret that falls back to a constant published in this
 * repository. Any one of those in front of real data is a full compromise, and
 * together they are all four at once.
 *
 * They used to be gated on `NODE_ENV !== 'production'`, which fails in the
 * wrong direction: an unset variable, an empty string, `Production` with a
 * capital P, a systemd unit that forgets to pass the environment through — each
 * of those quietly opened everything, with no error and no log line. The system
 * would look like it was working.
 *
 * So the test is now positive. Development has to say so, explicitly, with the
 * exact string. Anything else — including nothing at all — is treated as
 * production and locked down. A misconfigured deployment that refuses logins is
 * a bad afternoon; one that accepts forged ones is not recoverable.
 *
 * The shipped path never depended on this: Next's standalone `server.js` sets
 * NODE_ENV to production on its own, before any of this code loads. That is
 * exactly why it is worth pinning down — the security posture rested on a
 * default someone else chose, and nothing here asserted it.
 */
export function isDevMode(): boolean {
  return process.env.NODE_ENV === 'development';
}

let warned = false;

/**
 * Announce, once, that a request took a development-only shortcut.
 *
 * If these lines ever appear in a real deployment's logs, that deployment is
 * open. That is the entire point of saying it out loud.
 */
export function warnDevShortcut(what: string, details?: Record<string, unknown>): void {
  if (!warned) {
    warned = true;
    logger.warn(
      'DEVELOPMENT MODE: authentication shortcuts are active. If you are seeing this ' +
        'anywhere real, the service is unauthenticated — set NODE_ENV=production.',
    );
  }
  logger.debug(`DEV MODE: ${what}`, details);
}
