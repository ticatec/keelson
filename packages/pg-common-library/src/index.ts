/**
 * PostgreSQL Common Library
 * Production-ready PostgreSQL database driver implementation for @ticatec/node-common-library
 * @author Henry Feng
 * @version 3.1.0
 */

import { initializePg } from "./PgDBFactory.js";
import type { PostConnection } from "./PgDBFactory.js";

export { initializePg };
export type { PostConnection };