# 8. Configuration and cache

[中文](08-config-and-cache_CN.md) | English · [Tutorial index](README.md)

Getting configuration in from wherever operations keeps it, and putting a cache in front of
the things that do not change every second.

## Configuration

`AppConf` is the in-memory holder: you initialise it once with an object, and read from it
with dot notation.

```typescript
AppConf.init(config);

AppConf.getInstance()!.get('web.port');         // 3000
AppConf.getInstance()!.get('database.host');    // 'db.internal'
AppConf.getInstance()!.get('nope.nothing');     // undefined, no throw
```

`init()` is idempotent in the unhelpful direction: a second call keeps the first config and
ignores the new one. Initialise once, in `loadConfigFile()`.

The lookup reads own properties only, so `get('constructor')` and `get('toString')` return
`undefined` rather than something off `Object.prototype`. That matters when a key comes from
somewhere other than your own source.

Where the object comes from is `@ticatec/config-loader`'s job.

### Local YAML or JSON

```typescript
import { loadConfig } from '@ticatec/config-loader';

protected async loadConfigFile(): Promise<void> {
    const { appConf, loggerConf } = await loadConfig('local', 'app.yaml', 'logger.yaml');
    initialize(loggerConf);      // @ticatec/logger-pino
    AppConf.init(appConf);
}
```

`loadConfig(mode, configFile, logFile)` reads both documents and returns them separately.
Two files rather than one section of a bigger file, because the logger has to be configured
before anything else runs — including whatever reads the application config.

Local files are resolved against `CONFIG_DIR` if set, otherwise `./config`. A
`LocalFileLoader` can be constructed with an explicit root when you need one.

### Nacos or Consul

```typescript
const { appConf, loggerConf } = await loadConfig('nacos', 'app.yaml', 'logger.yaml');
```

Same call, different first argument — `'local'`, `'nacos'` or `'consul'`. The two remote
loaders need their client library installed (`nacos` or `consul`), which is why they are
optional peers and are loaded dynamically: a service using local files does not pay for
either.

Connection details come from environment variables — `NACOS_SERVER_ADDR` or
`NACOS_ENDPOINT`, `CONSUL_HTTP_ADDR` and their token variables. Configuration about where
configuration lives cannot itself live in the configuration.

`loadConfig()` closes the loader when it is done, so a Nacos heartbeat thread does not keep
the process alive after startup.

### Post-loaders

The fourth and fifth arguments hook each document, and they are narrower than they look:
`(content: string) => string`, applied to the **raw text before it is parsed**, and
synchronous. So they are for text substitution, not for reshaping a parsed object:

```typescript
const { appConf, loggerConf } = await loadConfig(
    'local', 'app.yaml', 'logger.yaml',
    null,                                              // no hook for the logger document
    (text) => text.replace(/\$\{(\w+)\}/g, (_, name) => process.env[name] ?? '')
);
```

With that hook, `password: ${DB_PASSWORD}` in the YAML picks the value up from the
environment.

Anything asynchronous — reading a secret from a vault — happens after the load and before
`AppConf.init()`, where you have a plain object and can await:

```typescript
const { appConf, loggerConf } = await loadConfig('local', 'app.yaml', 'logger.yaml');
appConf.database.password = await vault.read('db');
initialize(loggerConf);
AppConf.init(appConf);
```

Either way the password ends up in the config object and never in a log — which is why the
framework logs a connection summary rather than the config it was given (chapter 6).

## Cache

`@ticatec/redis-client` wraps ioredis with named singletons.

```typescript
import { RedisClient } from '@ticatec/redis-client';

protected async beforeStart(): Promise<void> {
    await RedisClient.init(AppConf.getInstance()!.get('redis'));          // 'default'
    await RedisClient.init(AppConf.getInstance()!.get('sessions'), 'sessions');
}
```

`init()` takes an ioredis options object, a `redis://` / `rediss://` URL, or `null` for an
in-memory mock (development only — the mock is a dev dependency and asking for it in
production throws with an explanation).

Reach an instance by name:

```typescript
const redis = RedisClient.getInstance();              // 'default'
const sessions = RedisClient.getInstance('sessions');
```

`getInstance()` throws if that name was never initialised, naming it. Like the bean
accessors, a missing dependency fails immediately rather than returning `undefined`.

### Reading and writing

```typescript
await redis.set('greeting', 'hello', 300);            // string, 300s TTL
const s = await redis.get('greeting');

await redis.setObject('user:U1', user, 600);          // JSON round-trip
const u = await redis.getObject<AppUser>('user:U1');

await redis.del('user:U1');
```

`set`/`get` are strings; `setObject`/`getObject` serialise. Keep them paired — a value
written with `set` and read with `getObject` gives you a parse error, and the reverse gives
you a string of JSON.

### Cache-aside in one call

```typescript
const profile = await redis.getOrSet<Profile>(
    `profile:${id}`,
    () => this.service.loadProfile(id),
    600
);
```

On a hit it returns the cached value; on a miss it calls your function, stores the result and
returns it. Two things to know: the fetch runs while the cache is cold, so a hot key expiring
under load means several concurrent fetches — pre-warm the ones that matter. And the value
round-trips through JSON, so a `Date` comes back as a string. Cache what serialises cleanly,
or restore the types on the way out.

### Invalidation belongs with the write

The cache does not know your data changed. Delete the key where the change happens — in the
service, after the transaction commits, not inside it:

```typescript
@Transaction()
async updateProfile(user: AppUser, profile: Profile): Promise<void> {
    await this.repo.update(profile);
}

// the caller
await profileService.updateProfile(user, profile);
await RedisClient.getInstance().del(`profile:${profile.id}`);
```

Deleting inside the transaction is the classic mistake: the delete is not transactional, so a
rollback leaves the cache empty — harmless — but a delete that happens *before* a concurrent
read repopulates it from the not-yet-committed state leaves the cache holding a value that
was rolled back. Invalidate after the commit.

### Health

Redis is usually a non-critical dependency — a cold cache is slower, not broken. Register it
that way (chapter 6) so an outage degrades the service instead of taking it out of rotation.

---

Next: [Before you go live](09-production-checklist.md).
