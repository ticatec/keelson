import BaseLoader, { getLoader, loadConfig } from "./lib/BaseLoader.js";
import type { PostLoader, ConfigMode } from "./lib/BaseLoader.js";

export default BaseLoader;
export { BaseLoader, getLoader, loadConfig };

/** 类型别名以 export type 导出，兼容 isolatedModules / 仅转译的工具链。 */
export type { PostLoader, ConfigMode };
