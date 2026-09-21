# Changelog

## [1.1.0] - 2026-09-22

### Added

- **Generic user type parameter on `BaseController<T, U = RegisteredUser>`.**
  Controllers can now declare a specific user type (e.g. `BaseController<AdminService, AdminUser>`),
  causing `this.getLoggedUser(req)` to return `U` directly with full static typing without manual casting.
  Cascaded through `CommonController<T, U>` and `CommonSearchController<T, U>`. Fully backward-compatible;
  defaults to server-wide `RegisteredUser`.

- **Lightweight, zero-auth root `Controller`.**
  Extracted pure HTTP root base class `Controller` providing structured logging (`this.logger`) and the
  shared debug flag (`Controller.debugEnabled`) without requiring a service or user authentication. Ideal
  for public APIs, webhooks, and health probes.

### Changed

- **Optimized controller logger initialization.**
  `this.logger` is initialized once as an instance property `getLogger(this.constructor.name)` instead of
  re-evaluating on every property access.

## [1.0.0] - 2026-09-19

### ⚠️ Breaking Changes

- **`CommonRoutes.userCheck()` is removed.** It had no call site since
  `@ticatec/common-express-server@0.5.4` - `bind()` called it up to 0.4.9, then switched to
  `isValidUser()` and left the method behind, still carrying a `@deprecated` note and three
  worked examples showing it used for authorization. An application that implemented its
  access control by overriding it lost that check on upgrade without a word: `isValidUser()`
  defaults to `return true`, so every request passed. Verified against the published
  tarballs of 0.4.9 and 0.5.4.

  Move the body of `userCheck()` into `isValidUser()`; the signature is identical. Note
  that removing a `protected` method is **not** a compile error for code that overrides it
  - the override simply becomes a method nobody calls. Search for `userCheck` before
  upgrading.

### Added

- **`BaseServer.registerHealthCheck()` / `unregisterHealthCheck()`.** Both READMEs showed
  `this.registerHealthCheck('database', ...)` in `beforeStart()` as the way to add a probe,
  and the method did not exist - copying the documented example produced
  `Property 'registerHealthCheck' does not exist`. The only way in was the `protected`
  `healthRegistry` field, which is what this package's own test resorted to, through a cast.

- **`UserResolver`, an extension point for turning a request into its caller.** Resolution
  used to be three hard-coded lines inside the `routerHelper` singleton: the header had to
  be named `user`, the language header `x-language`, and the encoding had to be
  URL-encoded JSON. Changing any of it meant forking the class.

  `HeaderUserResolver` is the default and keeps that behaviour, with each step - header
  name, language header, decoding, language application - as its own overridable method.
  `UserResolver` is the base for an identity that comes from somewhere else entirely: a
  bearer token, a cookie, a session store. `setUserResolver()` installs one at the
  composition root, and the installed resolver lives on a `Symbol.for()` key on
  `globalThis`, so the CommonJS and ESM builds share it.

  Two behaviours came along with the rewrite: a header sent twice arrives as an array from
  Express and used to reach `JSON.parse` as one, which throws; and a header that decodes to
  a string or a number was previously assigned to `req.user` as-is. Both are now treated as
  anonymous, with a warning.

### Fixed

- **A failed startup crashed the process instead of exiting from it.**
  `BaseServer.startup()` (the static one) returns `void` - it is the last call in `main`, so
  nothing is left to await it. Its `catch` rethrew, which turned the failure into an
  unhandled rejection; Node has terminated the process on those since v15, so a bad port
  produced a raw `ERR_SOCKET_BAD_PORT` stack instead of a logged error, the crash exit code
  overrode the `process.exitCode = 1` the handler had just set, and no line after the call
  ever ran. Reproduced against the built package. The chain now ends in the `catch`. To
  decide what happens on failure yourself, await the instance `startup()`, which still
  rethrows.

- **Errors were logged without their message or stack.** Every `catch` in `BaseServer`
  passed `{ err }` to the logger. `message` and `stack` are not enumerable properties, so
  once the object is serialized all that survives is `{"err":{"code":"ENOSPC"}}` - the one
  line worth reading is gone. Verified against the console fallback. The error is now passed
  as the context argument itself, which is what `@ticatec/logger-api` and pino expect. The
  static `startup()` also no longer logs a second copy of what the instance already logged.

- **`AppConf`, `Controller.debugEnabled` and `ProcessorManager` were split between the
  CommonJS and ESM builds.** All three were class statics, and this package ships both
  builds, so a process loading both got two of each: configuration written through the ESM
  `AppConf.init()` was invisible to a CommonJS `AppConf.getInstance()`; `debugEnabled` set
  on one side left the other's controllers silent; and processors registered through one
  manager were not the ones `BaseServer.shutdown()` stopped - the timers kept running and
  the process would not exit. Each now keeps its state on a `Symbol.for()` key on
  `globalThis`, which is one object per realm regardless of module format.

- **`AppConf.get()` walked the prototype chain.** The lookup used `k in result`, so
  `get('constructor')` and `get('toString')` returned members of `Object.prototype` that
  are not in anyone's configuration. It now tests own properties only.

- **The background-processor subsystem was unreachable.** `ProcessorManager` and
  `CommonProcessor` were not exported from the entry point, and the `exports` map allows
  only `.` and `./package.json`, so a deep import could not reach them either - while
  `BaseServer.shutdown()` called `ProcessorManager.getInstance().stopAll()` on a manager no
  application could register anything with. Both are exported now, along with
  `ProcessStatus`.

- **Idle keep-alive connections could delay shutdown on Node 18.** `server.close()` stops
  accepting new connections but, before Node 19, left idle keep-alive connections open, so
  the close callback could wait for them. `shutdown()` now calls `closeIdleConnections()`
  explicitly; on Node 19+ that is a no-op. It deliberately does **not** call
  `closeAllConnections()`, which would destroy connections that are still serving a request
  and truncate the response mid-write - a test asserts an in-flight request completes.

- **`bindRoutes()` before startup produced `/undefined/...` routes.** `contextRoot` is read
  from `getWebConf()` during `startup()`; used earlier it was interpolated into the path as
  the literal string `undefined`, the server started without complaint and every request
  404'd. `bindRoutes()` now fails with a message that says what happened, and so does using
  `this.app` before `startWebServer()` created it.

### Changed

- **`strict` and `isolatedModules` are on.** The build configs did not extend
  `tsconfig.json` - they were standalone - so nothing in the base config reached the
  shipped output, and `lib` sat outside `compilerOptions` where TypeScript ignores it. All
  three configs now extend the base, and a `tsconfig.test.json` was added so `pnpm
  typecheck` covers the test suite, which it never did.

  Of the 22 errors this surfaced, the ones worth naming: eight `req['user']` bracket
  accesses, which existed to dodge the fact that Express's `Request` has no `user` - the
  package now declares `req.user` on `Request`, so consumers get it too; `ProcessorManager.get()`
  was typed non-null while returning `Map.get()`; and `RouterHelper` logged
  `user.accountCode`, a field neither `CommonUser` nor `LoggedUser` declares.

- **The user identity is out of the logs.** `RouterHelper` logged `accountCode` on every
  request carrying a user header and again on every authenticated request, and a failed
  `isValidUser()` logged the entire user object - account, roles, tenant, everything the
  gateway put in the header. Those now record the route and whether impersonation was in
  play. Per-user request tracing belongs in an application middleware, not in the framework.

- Errors are no longer logged twice. `BaseServer`'s error middleware and `RouterHelper`'s
  two `catch` blocks each logged the error before handing it to `handleError()`, which has
  logged by status class since `@ticatec/node-exception@2.1.0`.

- Every log call passes a context object first, matching the rest of the monorepo.

- The README's links to the controller guide are absolute GitHub URLs. They were relative
  (`../../docs/prompts/...`), which resolves on GitHub and on npmjs.com but not in a
  downloaded tarball, where nothing sits two levels up.

- `publish-public` is renamed `publish:public`, the only package that spelled it with a
  hyphen. `types` points at the CommonJS declarations, as it does everywhere else. `pino`
  is gone from `devDependencies`; nothing referenced it. `CHANGELOG.md` is in `files`, and
  the package finally has a `LICENSE` file - it was the only one without.

### Documentation

- The README told you to import errors from `@ticatec/express-exception`. That package
  exists on npm, but it is not what this framework uses - the peer dependency is
  `@ticatec/node-exception`, and errors from a different class hierarchy would miss
  `handleError`'s `instanceof HttpError` check and come back as 500s. Two of the three
  examples also passed a message to constructors that take none.

- The documented `CommonUser` shape (`accountCode`, `name`, `tenant`, an index signature)
  does not exist; both interfaces are empty by design, and applications declare their model
  through `CustomUserRegistry`. That mechanism is now what the README shows.

- Peer dependency versions were stale in both READMEs (`@ticatec/keelson-core@^3.1.0`
  against an actual `>=1.0.0`, and `@ticatec/logger-api` missing entirely), the install
  commands used npm, and the Development section documented `npm run dev` - a script that
  does not exist.

### Renamed

This package was `@ticatec/common-express-server`. It is now **`@ticatec/keelson-express`**, and the
version restarts at 1.0.0 because a new name on npm is a new package with its own
publish history. The last release under the old name was
`@ticatec/common-express-server@2.0.1`; the work that had accumulated
locally as 2.0.1 ships here as 1.0.0.

To migrate, change the dependency and the import specifier - nothing else:

```diff
-"@ticatec/common-express-server": "^2.0.1"
+"@ticatec/keelson-express": "^1.0.0"
```

```diff
-import { ... } from '@ticatec/common-express-server';
+import { ... } from '@ticatec/keelson-express';
```

Every export keeps its name and signature. The old package will be deprecated on
npm with a pointer here.

