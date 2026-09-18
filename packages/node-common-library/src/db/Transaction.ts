import 'reflect-metadata';

export enum Propagation {
    REQUIRED,     // Default: join current transaction if present, otherwise create new
    REQUIRES_NEW, // Always create new independent transaction
    NONE,         // Do not start transaction (execute without transaction)
}

/**
 * Decorator to mark a service method for declarative transaction handling.
 * @param propagation Transaction propagation behavior.
 */
export function Transaction(propagation: Propagation = Propagation.REQUIRED) {
    return function (target: any, propertyKey: string, descriptor?: PropertyDescriptor) {
        Reflect.defineMetadata('transaction:propagation', propagation, target, propertyKey);
        Reflect.defineMetadata('transaction:enabled', true, target, propertyKey);
    };
}