/**
 * Batch processing record interface.
 * @template T - Data object type.
 */
export default interface BatchRecord<T> {

    /**
     * Record index or row number.
     */
    recNo: number;

    /**
     * Actual data object payload.
     */
    data: T;

    /**
     * Error information encountered during processing.
     */
    error: any;

}

/**
 * Array type definition for batch processing records.
 * @template T - Data object type.
 */
export type BatchRecords<T> = Array<BatchRecord<T>>;