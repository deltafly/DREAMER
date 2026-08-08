/**
 * Canonical timestamp handling.
 *
 * Every timestamp column in the schema is a String, not a DateTime, and every
 * ordering and range query in the codebase is therefore a *lexicographic*
 * comparison. That only works while every stored value has the exact same
 * shape, so there is exactly one canonical form:
 *
 *     YYYY-MM-DD HH:MM:SS   — always UTC, always 19 characters
 *
 * Anything that accepts a caller-supplied timestamp must run it through
 * `normalizeTimestamp` first. A value of a different width or precision sorts
 * into the wrong place and silently corrupts the supersede chain, which reads
 * the timeline back to decide which fact replaced which.
 */

/** Current time in canonical form. */
export function now(): string {
  return new Date().toISOString().replace('T', ' ').slice(0, 19);
}

/** Canonical form of a Date. */
export function toCanonical(date: Date): string {
  return date.toISOString().replace('T', ' ').slice(0, 19);
}

const DATE_ONLY = /^\d{4}-\d{2}-\d{2}$/;
const DATE_TIME = /^(\d{4}-\d{2}-\d{2})[ T](\d{2}:\d{2})(:\d{2})?(\.\d+)?$/;
const ZONED = /(Z|[+-]\d{2}:?\d{2})$/i;

/** Reject timestamps further than this into the future (clock skew allowance). */
const MAX_FUTURE_MS = 24 * 60 * 60 * 1000;

/**
 * Parse a caller-supplied timestamp into canonical form, or return null.
 *
 * Accepts a date on its own, a date and time with or without seconds, either
 * `T` or a space as the separator, and an explicit offset or `Z`.
 *
 * A value with NO zone marker is read as UTC, not as local time. This is
 * deliberate and it is the opposite of what `new Date(string)` does: the rest
 * of the system derives its timestamps from `toISOString()`, so parsing a bare
 * "2025-01-15 14:30" in the server's local zone would shift imported history
 * by the server's offset — an hour of drift that nothing downstream could see.
 *
 * Timestamps more than 24 hours in the future are rejected. Nothing legitimate
 * backdates forward, and `orderBy: { ts: 'desc' }` means a far-future entry
 * would otherwise pin itself to the top of every listing permanently.
 */
export function normalizeTimestamp(input: string): string | null {
  const trimmed = input.trim();
  if (!trimmed) return null;

  let iso: string;
  if (ZONED.test(trimmed)) {
    // Has an explicit zone — let Date do the offset arithmetic.
    iso = trimmed.replace(' ', 'T');
  } else if (DATE_ONLY.test(trimmed)) {
    iso = `${trimmed}T00:00:00Z`;
  } else {
    const parts = DATE_TIME.exec(trimmed);
    if (!parts) return null;
    const [, date, hhmm, ss] = parts;
    iso = `${date}T${hhmm}${ss ?? ':00'}Z`;
  }

  const parsed = new Date(iso);
  const ms = parsed.getTime();
  if (Number.isNaN(ms)) return null;
  if (ms > Date.now() + MAX_FUTURE_MS) return null;

  const canonical = toCanonical(parsed);

  // An impossible calendar date does not always fail to parse — Date rolls
  // 2025-02-31 forward into March rather than rejecting it. Round-tripping the
  // components catches that: a rolled-over value no longer matches what was
  // asked for. Only meaningful for zone-free input, where the canonical form
  // is expected to be character-identical to what we built.
  if (!ZONED.test(trimmed) && canonical !== iso.replace('T', ' ').slice(0, 19)) {
    return null;
  }

  return canonical;
}
