# AI Prompts for Keelson

[中文](AI_PROMPTS_CN.md) | English

Prompts for driving an AI assistant to write Keelson code that matches the framework's
conventions instead of inventing its own. Paste the rules block below once at the start of a
session, then the prompt for the layer you are working on.

| # | Layer | File |
| --- | --- | --- |
| 1 | Module setup and access control | [AI_PROMPTS_1_MODULE.md](AI_PROMPTS_1_MODULE.md) |
| 2 | Web layer — routes and controllers | [AI_PROMPTS_2_WEB.md](AI_PROMPTS_2_WEB.md) |
| 3 | Service layer — interface and implementation | [AI_PROMPTS_3_SERVICE.md](AI_PROMPTS_3_SERVICE.md) |
| 4 | Repository layer | [AI_PROMPTS_4_REPOSITORY.md](AI_PROMPTS_4_REPOSITORY.md) |
| 5 | DAO layer | [AI_PROMPTS_5_DAO.md](AI_PROMPTS_5_DAO.md) |

## The rules block

Paste this first. Everything else assumes the assistant has it.

```
You are writing TypeScript for an application built on the Keelson framework
(@ticatec/keelson-express, @ticatec/keelson-core). Follow these rules exactly. They are
conventions of this codebase, not suggestions.

LAYERS — four tiers, each calling only the next one down:

  Web (routes + controller) -> Service -> Repository -> DAO -> database

  A controller never calls a repository or a DAO.
  A service never calls a DAO.
  A DAO never calls another DAO and never calls a repository.

WHERE EACH KIND OF WORK BELONGS:

  Web layer        Boundary validation — ALL of it. Required fields, max/min values,
                   string lengths, formats, enum membership, date ranges. Declared with
                   @ticatec/bean-validator rules on the controller. Nothing downstream
                   re-validates the shape of the input.
                   Also: mapping the request onto service arguments, and nothing else.

  Service          Business logic, and the transaction boundary (@Transaction).
                   Declared as an interface; implemented by a class that extends
                   CommonService and implements that interface.
                   No SQL. No req/res. No validation of input shape.

  Repository       The bridge between service and DAO. Simple entity checks: does it
                   exist, is its status usable, does it belong to this tenant. Assembles
                   a domain entity from one or more DAOs. Owns the cache — if Redis is
                   used, it is used here, not in the service and not in the DAO.

  DAO              SQL, and nothing else. One table's worth. No business rules.

ERRORS — throw from any layer; the framework maps the type to a status code:

  IllegalParameterError(msg)      400    UnauthenticatedError()          401
  InsufficientPermissionError()   403    ActionNotFoundError()           404
  TimeoutError()                  408    ConflictError(msg)              409
  TooManyRequestsError()          429    AppError(msg?)                  500

  Never return an error object or a { success: false } envelope. Throw.
  For a record that exists but belongs to another tenant, throw ActionNotFoundError,
  not InsufficientPermissionError — a 403 confirms the record exists.

WIRING:

  Classes are registered by name with beanFactory (or Beans for lazy loaders) in
  BaseServer.beforeStart(). Inside a layer, resolve with this.getRepositoryInstance<T>(name)
  or this.getDAOInstance<T>(name), declared as a private getter, never a field.

JSDOC — required, not optional:

  Every method on a service, repository or DAO interface carries JSDoc: what it does,
  every @param, @returns, and @throws for each error type it can raise.
  Every public method on a web controller carries JSDoc.
  Every protected method on an implementation class carries JSDoc — those are the
  extension points, and a subclass author cannot read your intent from the body.

  Private methods and getters that only resolve a bean do not need it.

  The interface is the file someone reads to learn what a module can do. If its JSDoc
  does not answer "what does this throw and when", the interface is not finished.

THROWING — every throw site logs first:

  Before every `throw`, write a logger call that records WHY, with the inputs that led
  to the decision:

      if (order.status !== 'ACTIVE') {
          this.logger.warn({ orderId: order.id, status: order.status },
              'Rejecting cancel: order is not active');
          throw new ConflictError('Order is not active');
      }

  Level: warn for a 4xx the operator might care about (conflict, permission denied);
  debug for routine ones (not found, bad input); error for a 5xx.

  Log the reason and its inputs, NOT the error object — the framework's error middleware
  already records the error itself (5xx with its stack, 4xx at debug), so repeating it
  produces two entries for one event.

  The no-secrets rule still applies: an id, a status and a state transition are fine; a
  password, a token, a full request body or a user identifier are not.

LOGGING:

  Use this.logger, which every base class provides. Never console.*.
  Pass an Error as the context argument: logger.error(err, 'message'), never { err }.
  Never log a password, a token, a bind parameter value, a request body, or a user
  identifier.

TYPESCRIPT:

  strict is on. ESM with NodeNext, so relative imports carry a .js suffix even though the
  source is .ts. reflect-metadata is imported once, first, in the entry file.
  Use `import type` for type-only imports — isolatedModules is on, and `Request` from
  express in particular must be imported as a type because it shadows a DOM global.
  A route parameter is typed `string | string[]` in Express 5; wrap it with String(...)
  rather than casting.

Ask before inventing a table name, a column name, or a field that was not specified.
```

## How to use these

Each layer file has prompts in the order you would actually write the code: scaffold first,
then the specific case. They are written to be pasted verbatim — the placeholders in
`<angle brackets>` are the only parts you change.

The prompts deliberately over-specify. An assistant given "write a service for products"
will produce something plausible that ignores every convention above; one given the
interface name, the method signatures and the layer rules will produce something you can
merge.

## Verifying what comes back

Three checks catch most of what an assistant gets wrong here:

1. **Does it compile with `strict`?** Most convention violations are also type errors —
   a missing `!` on `createBean`, a raw `req.params.id`, a service returning the wrong shape.
2. **Does any layer reach past the next one?** Search the generated file for `DAO` inside a
   service, or `getDBConnection` inside a controller.
3. **Is there validation below the web layer?** A `if (!data.name) throw` inside a service
   means the assistant did not believe rule 2. Move it into the controller's rules.
4. **Does every `throw` have a log above it?** Grep the file for `throw new` and check the
   line before each one. This is the rule assistants drop most often, because nothing about
   the code looks wrong without it.
5. **Does every interface method have `@throws`?** An interface method that can raise
   `ConflictError` and does not say so is a caller's bug waiting to happen.
