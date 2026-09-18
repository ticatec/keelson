// The middleware logs every error it handles. Without a provider, logger-api
// falls back to the console, which would fill the test output with the stack
// traces the suites deliberately produce. `logging.test.ts` injects its own
// provider and is unaffected by this.
process.env.LOG_LEVEL = 'silent';
