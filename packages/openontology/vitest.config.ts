import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    // These suites drive a real file-backed SQLite database through
    // @libsql/client, so their wall time is set by the host filesystem's
    // durability cost, not by our code. Locally the whole libsql suite runs in
    // ~250ms; on a contended CI runner a single seed-and-reopen case has been
    // seen to pass 5s, which is vitest's default and is tuned for CPU-bound
    // unit tests. Give the I/O-bound cases enough headroom that a slow disk
    // reports as slow rather than as a spurious failure.
    testTimeout: 30_000,
    hookTimeout: 30_000
  }
});
