import CommonSearchCriteria from "./CommonSearchCriteria.js";

/**
 * Backward-compatible alias class for CommonSearchCriteria.
 * @template C - Type of the search criteria object, defaults to any.
 */
export default abstract class SearchCriteria<C = any> extends CommonSearchCriteria<C> {}