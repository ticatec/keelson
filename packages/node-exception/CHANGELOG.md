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
- Dual package hazard: the active container was a module-scoped variable, so an
  application mixing `require()` and `import` got two independent containers -
  one configured, one left at its default. State is now anchored to `globalThis`
  under `Symbol.for('@ticatec/node-exception.state')`.

### Added

- Test suite: 62 tests covering the error hierarchy, content negotiation,
  environment detection, HTML escaping and end-to-end Express behaviour,
  including regression tests for both security issues above.
- `getHttpContainer()` and the `ExpressContainer` class are exported, so
  applications can wrap or inspect the active container.

### Changed

- `strict` and `isolatedModules` are enabled; the compilation target moved from
  `es2017` to `es2020`.
- `engines.npm` (`>=6.0.0`) dropped; it contradicted `engines.node >= 18`.

## [2.0.0]

- Initial dual CJS/ESM release.
