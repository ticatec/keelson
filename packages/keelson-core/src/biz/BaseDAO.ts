import DBConnection from "../db/DBConnection.js";

export default interface BaseDAO<T, K> {

    /**
     * Creates a new entity.
     * @param conn - Database connection object.
     * @param item - Entity object to create.
     * @returns Promise resolving to the number of affected records.
     */
    createNew(conn: DBConnection, item: T): Promise<number>;

    /**
     * Updates an existing entity.
     * @param conn - Database connection object.
     * @param item - Entity object to update.
     * @returns Promise resolving to the number of affected records.
     */
    update(conn: DBConnection, item: T): Promise<number>;

    /**
     * Finds an entity by its primary key.
     * @param conn - Database connection object.
     * @param key - Primary key value.
     * @returns Promise resolving to the target entity object.
     */
    find(conn: DBConnection, key: K): Promise<T>;

}