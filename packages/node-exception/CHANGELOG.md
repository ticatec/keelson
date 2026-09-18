# Changelog

All notable changes to `@ticatec/node-exception` are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [2.1.0] - 2026-09-18

### Security

- **Stack traces could be disclosed on demand by any client.**
  `ExpressContainer.isDevelopment()` resolved the environment with
  `req.get('env')`, which reads the **`env` HTTP request header** rather than the
  Express application setting. The consequences ran in both directions: a real
  development server sent no such header and therefore never produced a stack
  trace, while any client could send `env: development` to a production server
  and receive full stack traces in the error payload. The environment is now
  resolved from server-side configuration only - Express' `env` application
  setting, falling back to `process.env.NODE_ENV`, defaulting to
  `development` - and the request is never consulted.

- **Cross-site scripting in the HTML error page.** `toHtml()` escaped only
  `message` and `stack`; `code`, `client`, `method`, `path` and `timestamp` were
  interpolated raw. `client` resolves to `req.ip`, which is taken from the
  `X-Forwarded-For` header whenever the application enables `trust proxy`, so
  markup injected there was reflected into the page verbatim. Every interpolated
  value is now HTML-escaped.

- Error responses now carry `X-Content-Type-Options: nosniff`, so a `text/plain`
  error body cannot be MIME-sniffed into something executable.

### Fixed

- **The HTML error page was unreachable in practice.** Content negotiation tested one
  type at a time, starting with `req.accepts('json')`. A browser's Accept header ends
  in `*/*;q=0.8`, which makes that call return `'json'` - so every browser page
  request was answered with JSON and the `text/html` branch was never taken.
  Negotiation now passes the candidates as a list, letting Express weigh the
  q-values: a browser's `text/html` (q=1.0) beats its `*/*` (q=0.8) and selects HTML,
  while a client sending only `*/*` still gets JSON.
- **`handleError` could throw `ERR_HTTP_HEADERS_SENT` out of the error handler.** The
  guard for an already-started response also required a callable `next`; callers that
  invoke the handler directly pass `null` (common-express-server's `RouterHelper`
  does), so they fell through to `res.status()` and crashed the process. The guard now
  returns regardless, and delegates to `next` only when there is one.
- `handleError` delegates to `next(err)` when the response has already started,
  instead of throwing `ERR_HTTP_HEADERS_SENT` while trying to write a status line.
- `handleError` no longer reads `.stack` off a non-`Error` throwable.
- Removed incoherent null-guarding in `sendApplicationError`: `httpContainer` was
  accessed optionally in two places, unconditionally in a third, and finally
  checked for existence after it had already been dereferenced - while the module
  always initialises it to an `ExpressContainer`.
- `HttpContainer` and `ErrorResponse` are exported with `export type`. Exporting
  interfaces in the value list breaks transpile-only toolchains (esbuild, swc,
  `ts-jest` with `isolatedModules`).
- Subpath exports (`./utils`, `./HttpError`, ...) now declare `types` per
  condition, matching the root export. The previous flat form handed CJS
  declarations to ESM consumers.
- `package.json#files` listed `CHANGELOG.md`, which did not exist.
- Removed `ErrorResponse.host`. It was declared as an optional field but never
  populated anywhere in the library, so it only ever appeared as a promise the code
  did not keep. Custom containers that want to identify the responding server can
  add their own field.
- Dual package hazard: the active container was a module-scoped variable, so an
  application mixing `require()` and `import` got two independent containers -
  one configured, one left at its default. State is now anchored to `globalThis`
  under `Symbol.for('@ticatec/node-exception.state')`.

### Added

- **Error logging via `@ticatec/logger-api`.** The split is by status class, not by
  error type. A 5xx - `AppError` (always 500), `ProxyError` (502),
  `ServiceUnavailableError` (503), any subclass returning >= 500 - and anything that
  is not an `HttpError` at all are logged at `error` level **with their stack**; in
  production the client gets no stack, so this record is the only thing that says
  why the request failed and on which line. 4xx is the client's problem and is
  logged at `debug`, so it stays out of production logs. The error is passed as the
  first log argument, the one shape both pino (through its `err` serializer,
  following `cause` as it goes) and the console fallback (which prints
  `error.stack`) render in full. A throwing logger cannot break error handling:
  logging failures are swallowed and the response is still sent.
  `@ticatec/logger-api` is declared as a peer dependency; with no provider
  registered it falls back to the console, filtered by `LOG_LEVEL`.
- **`ConflictError` (409)** for uniqueness violations and optimistic-locking
  failures, and **`TooManyRequestsError` (429)** for rate limits and quotas. No 422
  type ships with the library: `IllegalParameterError` (400) covers validation
  failures, and the 400/422 boundary is blurry enough in practice that two
  overlapping classes would only invite inconsistent use.
- **`ErrorOptions` on every error constructor**, so `new AppError(1002, 'save
  failed', { cause: dbError })` keeps the underlying failure attached. Node and pino
  both unwind `cause` when printing.
- Test suite: 104 tests covering the error hierarchy, content negotiation,
  environment detection, HTML escaping, logging and end-to-end Express behaviour,
  including a regression test for every defect listed here.
- `getHttpContainer()` and the `ExpressContainer` class are exported, so
  applications can wrap or inspect the active container.

### Changed

- `strict` and `isolatedModules` are enabled; the compilation target moved from
  `es2017` to `es2022`, matching `logger-api` and `logger-pino` (and giving
  `ErrorOptions` / `Error.cause`).
- README Node badge corrected from `>=14.0.0` to `>=18.0.0`, matching `engines`.
- `engines.npm` (`>=6.0.0`) dropped; it contradicted `engines.node >= 18`.

## [2.0.0]

- Initial dual CJS/ESM release.
