# Deprecations

Commands to run **after** the renamed packages are published, so each old name
points at its replacement instead of going quietly stale.

## Renamed packages

```bash
npm deprecate "@ticatec/node-common-library" \
  "Renamed to @ticatec/keelson-core. Every export keeps its name and signature; change the dependency and the import specifier."

npm deprecate "@ticatec/pg-common-library" \
  "Renamed to @ticatec/keelson-pg. Every export keeps its name and signature; change the dependency and the import specifier."

npm deprecate "@ticatec/mysql-common-library" \
  "Renamed to @ticatec/keelson-mysql. Every export keeps its name and signature; change the dependency and the import specifier."

npm deprecate "@ticatec/dm-common-library" \
  "Renamed to @ticatec/keelson-dm. Every export keeps its name and signature; change the dependency and the import specifier."

npm deprecate "@ticatec/common-express-server" \
  "Renamed to @ticatec/keelson-express. Every export keeps its name and signature; change the dependency and the import specifier."
```

## Earlier rename

```bash
npm deprecate "@ticatec/logger-wrapper" \
  "Renamed to @ticatec/logger-pino."
```

## Security advisories

`@ticatec/node-exception@2.0.0` and earlier disclose stack traces to any client
that sends an `env: development` request header, and do not escape the
request-derived fields of the HTML error page. Both are fixed in 2.1.0.

```bash
npm deprecate "@ticatec/node-exception@<2.1.0" \
  "Security: stack traces could be forced by an `env` request header, and the HTML error page did not escape request-derived fields. Upgrade to >=2.1.0."
```

## Before publishing anything

`@ticatec/node-exception@2.1.0` already exists on npm. Confirm that the published
2.1.0 is the build that carries the two security fixes above; if it predates them,
the local version must move to 2.2.0 rather than republishing the same number with
different contents.
