// Scheduler is initialized lazily via getScheduler() on first API call.
// We do NOT start it here because croner + prisma in the instrumentation
// hook blocks Turbopack dev server startup.
export async function register() {
  // Fail-fast on missing required environment variables
  try {
    const { assertEnv } = await import('@/lib/env');
    assertEnv();
  } catch {
    // Edge Runtime — env validation may not be available
  }
}