import BaseLoader, { getLoader, loadConfig } from "./lib/BaseLoader.js";
import LocalFileLoader from "./lib/local-file/LocalFileLoader.js";
import type { PostLoader, ConfigMode } from "./lib/BaseLoader.js";

export default BaseLoader;

/**
 * `LocalFileLoader` 直接从入口导出：它不依赖任何可选 peer，是最常用的一种，
 * 此前调用方要么走 `getLoader('local')`，要么只能自己去猜包内路径。
 *
 * `ConsulLoader` 与 `NacosConfigLoader` 不在这里导出——它们分别需要可选 peer
 * `consul` / `nacos`，静态导出会让没装这两个包的使用者在加载入口时就报错。
 * 用 `getLoader('consul' | 'nacos')` 获取，它是动态 import，按需加载。
 */
export { BaseLoader, LocalFileLoader, getLoader, loadConfig };

/** 类型别名以 export type 导出，兼容 isolatedModules / 仅转译的工具链。 */
export type { PostLoader, ConfigMode };
