# Changelog

## [1.0.0] - 2026-09-19

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

