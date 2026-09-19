/**
 * Optimistic lock exception thrown when a concurrent update conflict occurs.
 */
export default class OptimisticLockException extends Error {

    #entity: any;

    /**
     * Constructs an OptimisticLockException.
     * @param message - Error message.
     * @param entity - Conflicting target entity object.
     */
    constructor(message: string, entity: any) {
        super(message);
        Error.captureStackTrace(this, this.constructor);
        this.name = this.constructor.name;
        this.#entity = entity;
    }

    /**
     * Retrieves the conflicting target entity object.
     * @returns Conflicting entity object.
     */
    get entity(): any {
        return this.#entity;
    }
}