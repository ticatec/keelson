/**
 * Paginated query result interface.
 */
export default interface PaginationList {
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
    list: Array<any>;
    /**
     * Total calculated number of pages.
     */
    pages: number;
}
