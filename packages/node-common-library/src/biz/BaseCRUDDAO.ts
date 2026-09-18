import BaseDAO from "./BaseDAO.js";
import DBConnection from "../db/DBConnection.js";

export default interface BaseCRUDDAO<T, K> extends BaseDAO<T, K> {

    /**
     * Removes an entity.
     * @param conn - Database connection object.
     * @param item - Entity object to remove.
     * @returns Promise resolving to the number of affected records.
     */
    remove(conn: DBConnection, item: T): Promise<number>;

}