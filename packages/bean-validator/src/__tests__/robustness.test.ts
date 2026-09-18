import beanValidator, {StringValidator, NumberValidator} from '../index';

describe('NumberValidator string parsing', () => {
    const rules = [new NumberValidator('n', {})];
    const check = (input: unknown) => beanValidator.validate({n: input}, rules);

    it.each([
        ['12', 12],
        ['  12  ', 12],
        ['-3.5', -3.5],
        ['+7', 7],
        ['.5', 0.5],
        ['1e3', 1000],
        ['1E-2', 0.01]
    ])('accepts %p as %p', (input, expected) => {
        const data = {n: input};
        expect(beanValidator.validate(data, rules).valid).toBe(true);
        expect(data.n as unknown).toBe(expected);
    });

    // Number('0x1f') is 31 and Number('Infinity') is Infinity. Neither is
    // something a form or a JSON payload means by a numeric field, and an
    // Infinity written back into the bean serialises to null and breaks inserts.
    it.each(['0x1f', '0b101', '0o17', 'Infinity', '-Infinity', 'NaN', '12abc', '1,000', '1 2'])(
        'rejects %p', (input) => {
            const res = check(input);
            expect(res.valid).toBe(false);
            expect(res.errors[0].message).toBe('is not a valid number');
        });

    it.each([Infinity, -Infinity, NaN])('rejects the number %p directly', (input) => {
        expect(check(input).valid).toBe(false);
    });

    it('never writes a non-finite value back into the bean', () => {
        const data = {n: 'Infinity'};
        beanValidator.validate(data, rules);
        expect(data.n).toBe('Infinity');
        expect(JSON.parse(JSON.stringify(data)).n).toBe('Infinity');
    });
});

describe('ValidationResult.errors', () => {
    it('hands out a copy, not the internal list', () => {
        const res = beanValidator.validate({v: null}, [new StringValidator('v', {required: true})]);
        expect(res.errors).toHaveLength(1);

        res.errors.push({field: 'injected', message: 'not a real error'});

        expect(res.errors).toHaveLength(1);
        expect(res.errorMessage).toBe('v: cannot be empty');
    });
});

describe('nested field writes', () => {
    it('creates missing intermediate objects', () => {
        const data: any = {};
        beanValidator.validate(data, [new StringValidator('a.b.c', {defaultValue: 'deep'})]);
        expect(data).toEqual({a: {b: {c: 'deep'}}});
    });

    // The old guard was `if (!current[key])`, which replaced a falsy primitive
    // with {} and destroyed whatever was there.
    it.each([[0], [''], [false], [NaN]])('refuses to overwrite the primitive %p on the path', (existing) => {
        const data: any = {a: existing};
        beanValidator.validate(data, [new StringValidator('a.b', {defaultValue: 'z'})]);
        expect(data.a).toBe(existing as any);
    });

    it('still refuses prototype-polluting paths', () => {
        const data: any = {};
        beanValidator.validate(data, [new StringValidator('__proto__.polluted', {defaultValue: 'X'})]);
        expect(({} as any).polluted).toBeUndefined();
        expect(data.polluted).toBeUndefined();
    });

    it('descends into an existing array', () => {
        const data: any = {rows: [{}]};
        beanValidator.validate(data, [new StringValidator('rows.0.name', {defaultValue: 'n'})]);
        expect(data.rows[0].name).toBe('n');
    });
});
