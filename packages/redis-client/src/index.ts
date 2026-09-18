import RedisClient from "./RedisClient.js";
import AbstractCachedData from "./cached-data/AbstractCachedData.js";
import CachedDataManager from "./cached-data/CachedDataManager.js";

// 默认导出（保留以兼容 `import RedisClient from "@ticatec/redis-client"` 的既有用法）
export default RedisClient;

// 具名导出（推荐用法：`import { RedisClient } from "@ticatec/redis-client"`）
// 不依赖 default export 的 CJS/ESM 互操作解析，避免消费方在不同构建/运行环境下
// 需要写 `(_RedisClient as any).default || _RedisClient` 这类兜底代码。
export {
    RedisClient,
    AbstractCachedData,
    CachedDataManager
};
