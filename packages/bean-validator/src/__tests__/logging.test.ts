import {setLoggerProvider, resetLoggerProvider} from '@ticatec/logger-api';
import type {Logger} from '@ticatec/logger-api';
import beanValidator, {
    StringValidator,
    NumberValidator,
    ObjectValidator,
    ArrayValidator,
    ValidationError
} from '../index';

type Record_ = {level: string; first: unknown; msg?: string};

const records: Record_[] = [];
const capture = (level: string) => (first: unknown, msg?: string) => {
    records.push({level, first, msg});
};

const spyLogger: Logger = {
    trace: capture('trace'),
    debug: capture('debug'),
    info: capture('info'),
    warn: capture('warn'),
    error: capture('error')
} as Logger;

describe('validation logging', () => {
    beforeEach(() => {
        records.length = 0;
        setLoggerProvider(() => spyLogger);
    });
    afterEach(() => resetLoggerProvider());

    it('writes nothing when validation passes', () => {
        const res = beanValidator.validate({name: 'ok'}, [new StringValidator('name', {required: true})]);
        expect(res.valid).toBe(true);
        expect(records).toHaveLength(0);
    });

    // Validation failure is an expected outcome of handling untrusted input - the
    // caller's problem, not a server fault - so it stays at debug the way 4xx does
    // in @ticatec/node-exception.
    it('logs failures at debug level with the structured errors', () => {
        const res = beanValidator.validate({name: '', age: 'x'}, [
            new StringValidator('name', {required: true}),
            new NumberValidator('age', {required: true})
        ]);

        expect(res.valid).toBe(false);
        expect(records).toHaveLength(1);
        expect(records[0].level).toBe('debug');
        expect(records[0].msg).toBe('Validation failed with 2 error(s)');
        expect((records[0].first as {errors: ValidationError[]}).errors).toEqual(res.errors);
    });

    it('logs once for a whole bean, not once per rule', () => {
        beanValidator.validate({}, [
            new StringValidator('a', {required: true}),
            new StringValidator('b', {required: true}),
            new StringValidator('c', {required: true})
        ]);
        expect(records).toHaveLength(1);
        expect(records[0].msg).toBe('Validation failed with 3 error(s)');
    });

    // ObjectValidator and ArrayValidator re-enter validate() with a prefix. Logging
    // there too would emit several overlapping partial records for one validation.
    it('logs once for a nested object, not once per level', () => {
        const res = beanValidator.validate({user: {email: ''}}, [
            new ObjectValidator('user', {rules: [new StringValidator('email', {required: true})]})
        ]);
        expect(res.valid).toBe(false);
        expect(records).toHaveLength(1);
        expect((records[0].first as {errors: ValidationError[]}).errors[0].field).toBe('user.email');
    });

    it('logs once for an array, not once per row', () => {
        beanValidator.validate({rows: [{n: 'x'}, {n: 'y'}, {n: 'z'}]}, [
            new ArrayValidator('rows', {rules: [new NumberValidator('n', {required: true})]})
        ]);
        expect(records).toHaveLength(1);
        expect(records[0].msg).toBe('Validation failed with 3 error(s)');
    });

    it('does not put field values into the log', () => {
        beanValidator.validate({password: 'hunter2!'}, [new StringValidator('password', {minLen: 20})]);
        expect(JSON.stringify(records)).not.toContain('hunter2');
    });

    it('still returns the result when the logger throws', () => {
        setLoggerProvider(() => ({
            trace: () => undefined,
            debug: () => {
                throw new Error('logger is broken');
            },
            info: () => undefined,
            warn: () => undefined,
            error: () => undefined
        } as Logger));

        let res!: ReturnType<typeof beanValidator.validate>;
        expect(() => {
            res = beanValidator.validate({}, [new StringValidator('a', {required: true})]);
        }).not.toThrow();
        expect(res.valid).toBe(false);
        expect(res.errors).toHaveLength(1);
    });
});
