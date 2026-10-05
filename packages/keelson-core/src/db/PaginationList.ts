/**
 * Paginated query result interface.
 * @template T Type of items in the list.
 */
export default interface PaginationList<T = any> {
    /**
     * Total matching record count.
     */
    count: number;
    /**
     * Whether more data is available beyond current page.
     */
    hasMore: boolean;
    /**
     * Array of items on the current page.
     */
    list: Array<T>;
    /**
     * Total calculated number of pages.
     */
    pages: number;
}
