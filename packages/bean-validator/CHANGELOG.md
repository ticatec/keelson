# Changelog

All notable changes to `@ticatec/bean-validator` are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [1.1.0] - 2026-09-18

### Fixed

- **An empty field reported a type error instead of "cannot be empty".** An
  untouched input in an HTML form posts `''`, not `null`. Every validator except
  `StringValidator` ran that through its type check and answered
  `is not a valid number` / `is not a valid date` / `is not an array`, which tells
  the user nothing about what to do. A value that is empty - or, for the non-string
  validators, whitespace-only - is now treated as not filled in: required fields
  report `cannot be empty`, optional fields are skipped entirely instead of failing.
  `StringValidator` is unchanged: an empty string is a real value there, so
  `minLen` and `format` still apply, and `trim: false` still preserves whitespace.

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
- 83 new tests (43 -> 126), including a regression test for each defect above.

### Changed

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
