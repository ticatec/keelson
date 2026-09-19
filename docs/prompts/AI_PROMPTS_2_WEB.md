# 2. Web layer — routes and controllers

[中文](AI_PROMPTS_2_WEB_CN.md) | English · [Index](AI_PROMPTS.md)

The layer that turns an HTTP request into a service call. Its second job, and the one that
is easiest to let slip, is that **all** boundary validation happens here.

## The validation rule

Every constraint on the *shape* of the input is declared on the controller and nowhere else:

- required / not null
- maximum and minimum numeric values
- string length, minimum and maximum
- format — email, phone, pattern
- enum membership
- date ranges

A service that starts with `if (!data.name) throw new IllegalParameterError(...)` is a
service written by someone who did not trust this rule. Delete the check and add the rule.

What the service still does check is everything validation cannot know: that the code is
unique, that the state transition is legal, that this caller may do this. Those need the
database or the caller, which is why they are not boundary validation.

The practical reason to keep the line sharp: validation rules are declarative and visible at
the edge, so the set of accepted inputs is one file to read. Scatter them and nobody can
answer "what does this endpoint accept?" without reading four layers.

## What a controller may not do

No SQL, no repository, no DAO, no `getDBConnection`. It resolves its service by name,
validates, maps the request onto arguments, and returns. Anything else belongs downstream.

---

## Prompt 2.1 — Controller and routes for a CRUD entity

```
Create the web layer for <Order>.

Service interface (already defined, do not rewrite it):

  interface <OrderService> {
      createNew(user: AppUser, data: <Order>): Promise<string>;
      update(user: AppUser, data: <Order>): Promise<void>;
      search(user: AppUser, criteria: any): Promise<PaginationList<<Order>>>;
  }

Entity fields and their constraints:

  code        string, required, max 32, uppercase letters and digits only
  customerId  string, required, max 36
  amount      number, required, 0 to 1000000
  currency    string, required, one of CNY USD EUR
  remark      string, optional, max 500
  dueDate     date, optional, must not be in the past

Produce two files:

1. src/controller/<Order>Controller.ts
   - extends CommonSearchController<<OrderService>>
   - public constructor resolving the service:
     super(beanFactory.createBean<<OrderService>>('<OrderService>')!)
   - getCreateRules(): every constraint above
   - getUpdateRules(): the same, plus `id` required — and `code` NOT required, because an
     update must not let the code be changed

2. src/routes/<Order>Routes.ts
   - extends AuthenticatedRoutes
   - default export
   - binds POST / -> createNew(), PUT / -> update(), GET / -> search()

Use @ticatec/bean-validator: StringValidator, NumberValidator, DateValidator,
EnumValidator. Put no validation anywhere except getCreateRules/getUpdateRules.

Documentation:
- JSDoc on every public method of the controller, and on every protected method you
  override — getCreateRules, getUpdateRules, getCreateNewArguments and the rest are
  extension points, so say what each one returns and why it differs from the default
- a class-level JSDoc block on the routes class listing the paths it binds
```

## Prompt 2.2 — Custom service arguments

```
The <Order> service methods do not take (user, body). Override the argument mapping on
<Order>Controller:

  createNew  -> [user, tenantCode from the path parameter :tenantId, req.body]
  update     -> [user, the id from the path parameter :id, req.body]

Override getCreateNewArguments(req) and getUpdateArguments(req).

A route parameter is typed `string | string[]` in Express 5 — wrap each with String(...),
do not cast with `as string`.

getLoggedUser(req) returns the impersonated user when impersonation is active; use it
rather than reading req.user directly.
```

## Prompt 2.3 — An endpoint that is not CRUD

```
Add an endpoint to <Order>Routes that does not fit the CommonController shape:

  POST /<:id>/cancel   body: { reason: string }   -> <OrderService>.cancel(user, id, reason)

Requirements:
- Validate the body with a bean-validator rule set: reason required, max 200 characters.
  Run it explicitly, since this path does not go through CommonController's rules.
- Resolve the service the same way the controller does
- Wrap the handler with routerHelper.invokeRestfulAction
- Return nothing on success, so the framework answers 204
- JSDoc on the handler: what it does, @param, @throws for anything it raises itself
- if the handler throws directly (a rule the validators cannot express), log why first

Show where the validation rules live and how they are invoked, given that this is not a
CommonController method.
```

## Prompt 2.4 — An endpoint that controls its own response

```
Add an export endpoint to <Order>Routes:

  GET /export  ->  a CSV file

Requirements:
- Use routerHelper.invokeController, not invokeRestfulAction, because the response is not
  JSON
- Set Content-Type to text/csv and Content-Disposition with a filename
- Validate the query parameters (date range required, span at most 90 days) before calling
  the service
- Let errors propagate; invokeController catches them and hands them to the error
  middleware

The service returns the CSV as a string. The controller does not build it.
```

## Prompt 2.5 — Reshaping the body before validation

```
The client sends <a flat payload with dotted keys / a payload using different field names>
and the service expects <the nested entity>.

Override buildNewEntry(req) and buildUpdatedEntry(req) on <Order>Controller to map the
incoming body onto the entity shape. Validation rules run against the result, so declare
them against the entity's field names, not the client's.

Do not accept fields the entity does not declare: build the object explicitly, field by
field, rather than spreading req.body. A field with no validation rule passes through
untouched, so a spread is how `isAdmin: true` reaches a service.
```

## Prompt 2.6 — Validation rules with a custom check

```
Add these rules to <Order>Controller, which need more than the built-in validators:

- `code` must be unique in format AND uppercase — use StringValidator with a `format`
  of { regex, message } and toUpperCase: true
- `dueDate` must be at least <3> days in the future — use DateValidator with the
  appropriate day-boundary option
- `items` must be a non-empty array of at most <50> entries, each with a productId and a
  quantity of at least 1 — use ArrayValidator with a nested ObjectValidator

Do not use the `check` option to query the database. Uniqueness against stored data is the
repository's job, not a validation rule — a validator that hits the database turns every
request into a round-trip before the transaction even opens.
```

---

Next: [Service layer](AI_PROMPTS_3_SERVICE.md). Deeper background:
[Controller guide](CONTROLLER.md), [Bean Validation guide](BEAN_VALIDATION.md),
tutorial chapter [4](../../tutorial/04-http-layer.md).
