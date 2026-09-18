import DBConnection from "./DBConnection.js";

/**
 * Database connection factory interface.
 */
export default interface DBFactory {
    /**
     * Creates a new database connection instance.
     * @returns Promise resolving to a DBConnection object.
     */
    createDBConnection(): Promise<DBConnection>;

    /**
     * Closes the connection pool and releases all resources.
     */
    close(): Promise<void>;
}