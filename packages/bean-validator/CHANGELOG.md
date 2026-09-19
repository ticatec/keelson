# Changelog

All notable changes to `@ticatec/bean-validator` are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [1.1.0] - 2026-09-18

### Fixed

- **A non-object root crashed the process.** `setFieldValue` wrote straight into
  `data`, so validating `null` - a client posting a bare `null` JSON body - threw
  an uncaught `TypeError` as soon as any rule wrote back (a `defaultValue`, or a
  type conversion), taking the request down instead of returning a validation
  error. The same applied to `undefined` and to a primitive root. Writes into a
  non-object root are now skipped, and required fields still report
  `cannot be empty`.

- **An optional string left blank failed `minLen` and `format`.** Leaving an
  optional field empty posts `''`, which went straight into the length and pattern
  checks: `{ website: '' }` came back as "invalid url" and `{ bio: '' }` as "length
  must be at least 10 characters" - while omitting the key entirely passed. Blank
  now skips those checks, so an empty optional field and an absent one behave the
  same. A required field is unaffected and still reports `cannot be empty`.

- **A `check` callback returning a plain string lost the field name.** The string
  went to `ValidationResult.appendError`, whose back-compatibility shim splits on
  the first colon to guess a field - so the result was `{ field: '', message }`,
  leaving a UI with nothing to attach the error to. Worse, a message that
  legitimately contained a colon was truncated: `'expected format: HH:mm'` became
  `{ field: 'expected format', message: 'HH:mm' }`. A callback is attached to a
  known field, so a plain string is now reported against that field (alias and
  nesting prefix included) and the message is kept whole. Returning a
  `ValidationError` object still passes through untouched, for cross-field rules.

- **`BooleanValidator` accepted any non-zero number.** `value != 0` turned 42, -1,
  2.5 and `Infinity` into `true`, while the string `'42'` was a type error - the
  same value giving opposite verdicts depending on how it was written, and neither
  matching the documented `true, false, 0, 1, "true", "false", "1", "0"`. Only 0
  and 1 are accepted now.

- **An empty field reported a type error instead of "cannot be empty".** An
  untouched input in an HTML form posts `''`, not `null`. Every validator except
  `StringValidator` ran that through its type check and answered
  `is not a valid number` / `is not a valid date` / `is not an array`, which tells
  the user nothing about what to do. A value that is empty - or, for the non-string
  validators, whitespace-only - is now treated as not filled in: required fields
  report `cannot be empty`, optional fields are skipped entirely instead of failing.
  For `StringValidator`, empty optional strings skip length and pattern checks
  (see above), while with `trim: false` whitespace is preserved.

- **`maxDaysBefore` / `maxDaysAfter` produced non-deterministic results.** The
  boundary was computed in milliseconds from a `now` read at validation time, so a
  value of "exactly N days ago" validated differently depending on how many
  milliseconds had passed since it was constructed - the same value could pass and
  then fail 2 ms later. The error message had always quoted a whole day
  (`cannot be earlier than Tue Sep 08 2026`), so the check now matches it: the
  boundary is the start of the day N days back, or the end of the day N days ahead.
  Day arithmetic goes through `Date#setDate` rather than adding 86 400 000 ms, so
  it stays correct across a daylight-saving transition. Explicit `from` / `to`
  dates are unchanged and still compare as exact instants.

- **`NumberValidator` accepted values no numeric field means.** Parsing went
  through `Number()`, so `'0x1f'` became 31, `'0b101'` became 5 and `'Infinity'`
  became `Infinity` - which, once written back into the bean, serialises to `null`
  and breaks a database insert. Strings must now match a decimal literal
  (sign, digits, decimal point, exponent); `'1e3'` still works. Non-finite numbers
  are rejected whether they arrive as a string or as a number.

- **`ValidationResult.errors` handed out the internal array**, so anything a caller
  pushed into it became part of the validation result. It now returns a copy.

- **A nested field path destroyed a falsy value on the way down.** `setFieldValue`
  tested `if (!current[key])` before creating an intermediate object, so writing
  `a.b` on `{a: 0}` replaced the `0` with `{}`. It now creates an object only when
  the intermediate is `null`/`undefined`, and leaves the data alone when a
  primitive is already there.

### Added

- **Validation failures are logged through `@ticatec/logger-api`.** One `debug`
  record per validation carries the structured error list. `debug` rather than
  `warn`: a validation failure is the expected outcome of handling untrusted input
  - the caller's problem, not a server fault - and at any real traffic volume a
  higher level would drown out the records that matter. It is the same treatment
  `@ticatec/node-exception` gives a 4xx. Only the outermost call logs, so a nested
  object or an array produces one record rather than one per level or per row, and
  field values never reach the log - only field names and rendered messages. A
  throwing logger cannot break validation. `@ticatec/logger-api` is declared as a
  peer dependency; with no provider registered it falls back to the console,
  filtered by `LOG_LEVEL`.
- **The localisation API is reachable.** `Locale.ts` had always exported
  `setLocaleMessage`, but `index.ts` never re-exported it, so the feature could not
  be used from outside the package. `setLocaleMessage`, `getMessage`,
  `resetLocaleMessage` and `DEFAULT_MESSAGES` are now part of the public API, and
  `setLocaleMessage` takes a `Partial<LocaleMessages>` - a partial translation no
  longer requires restating every template.
- The locale is anchored to `globalThis` under
  `Symbol.for('@ticatec/bean-validator.locale')`, so the CommonJS and ESM builds
  share one message set. Previously an application mixing `require()` and `import`
  got two, one translated and one still in English.
- Every options interface is exported (`StringValidatorOptions`,
  `NumberValidatorOptions`, `DateValidatorOptions`, `EnumValidatorOptions`,
  `ArrayValidatorOptions`, `ObjectValidatorOptions`, `ValidatorOptions`,
  `CustomCheck`, `IgnoreCheck`, `LocaleMessages`), plus `CommonValidator`.
- 123 new tests (43 -> 166), including a regression test for each defect above.

### Removed

- The `INVALID_ARRAY`, `INVALID_OBJECT` and `INVALID_ARRAY_ITEM` message templates.
  Nothing in the package referenced them; `ArrayValidator` and `ObjectValidator`
  report through `IS_NOT_ARRAY` / `IS_NOT_OBJECT` and merge their children's
  errors. They are gone from `LocaleMessages`, which is first exported in this
  release, so no published type is affected.
- The `dayjs` dev dependency. Date handling is native throughout; nothing imported it.

### Changed

- Copyright holder in `LICENSE` is **Ticatec** across every package in the monorepo. It
  had been split between `Henry Feng` and `Ticatec` (and one lowercase `ticatec`). Each
  file keeps its own year, which is the year that package was first published, not the
  year of this edit. The npm `author` field still names Henry Feng with his email - the
  author of the code and the holder of the copyright are two different fields, and only
  the second one was ambiguous.

- `ValidationError` is exported with `export type`. Exporting an interface in the
  value list breaks transpile-only toolchains (esbuild, swc, `isolatedModules`).
- `typecheck` and `lint` scripts and an `.eslintrc.json` were added. Without them
  the monorepo's `pnpm verify` skipped this package entirely - which is how the
  date defect above survived as an intermittently failing test.
- `strict` was already on; `isolatedModules`, `declarationMap` and `sourceMap` are
  now too, and the compilation target moved from `es2017` to `es2022`. The `lib`
  key had been sitting outside `compilerOptions`, where TypeScript ignored it.
- `engines.node` raised from `>=14.0.0` to `>=18.0.0`, matching the other packages.

## [1.0.2]

- Earlier releases are not documented here.
