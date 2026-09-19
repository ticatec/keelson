import beanValidator, {
    StringValidator,
    NumberValidator,
    BooleanValidator,
    ObjectValidator,
    ValidationError
} from '../index';

describe('a non-object root must not crash the process', () => {
    // A client posting the literal `null` as a JSON body used to take the whole
    // request down with an uncaught TypeError, instead of coming back with a
    // validation error, as soon as any rule wrote to the bean (a defaultValue or
    // a type conversion).
    it.each([[null], [undefined], ['abc'], [42], [true]])('survives a root of %p', (root) => {
        let res!: ReturnType<typeof beanValidator.validate>;
        expect(() => {
            res = beanValidator.validate(root, [
                new StringValidator('name', {defaultValue: 'default_name'}),
                new NumberValidator('age', {defaultValue: 1})
            ]);
        }).not.toThrow();
        expect(res.valid).toBe(true);
    });

    it('still reports required fields on a null root', () => {
        const res = beanValidator.validate(null, [new StringValidator('name', {required: true})]);
        expect(res.valid).toBe(false);
        expect(res.errors[0].message).toBe('cannot be empty');
    });

    it('survives a nested rule whose parent is a primitive', () => {
        expect(() => {
            beanValidator.validate({user: 'not-an-object'}, [
                new ObjectValidator('user', {rules: [new StringValidator('name', {defaultValue: 'x'})]})
            ]);
        }).not.toThrow();
    });
});

describe('an optional string left blank', () => {
    // Leaving an optional field blank posts '', and '' used to fail format and
    // minLen - while removing the key entirely passed. Same intent, opposite result.
    it('does not trip format', () => {
        const rules = [new StringValidator('website', {
            format: {regex: /^https?:\/\//, message: 'invalid url'}
        })];
        expect(beanValidator.validate({website: ''}, rules).valid).toBe(true);
        expect(beanValidator.validate({}, rules).valid).toBe(true);
        expect(beanValidator.validate({website: 'ftp://x'}, rules).valid).toBe(false);
    });

    it('does not trip minLen', () => {
        const rules = [new StringValidator('bio', {minLen: 10})];
        expect(beanValidator.validate({bio: ''}, rules).valid).toBe(true);
        expect(beanValidator.validate({bio: 'short'}, rules).valid).toBe(false);
    });

    it('behaves the same whether the key is blank or absent', () => {
        const rules = [new StringValidator('bio', {minLen: 10, format: {regex: /x/, message: 'nope'}})];
        expect(beanValidator.validate({bio: ''}, rules).valid)
            .toBe(beanValidator.validate({}, rules).valid);
    });

    it('is unchanged when the field is required', () => {
        const res = beanValidator.validate({website: ''}, [new StringValidator('website', {
            required: true,
            format: {regex: /^https?:\/\//, message: 'invalid url'}
        })]);
        expect(res.valid).toBe(false);
        expect(res.errors[0].message).toBe('cannot be empty');
    });

    it('still runs a custom check on the blank value', () => {
        const res = beanValidator.validate({v: ''}, [new StringValidator('v', {
            minLen: 5,
            check: (value) => (value === '' ? 'blank is not allowed here' : null)
        })]);
        expect(res.errors).toEqual([{field: 'v', message: 'blank is not allowed here'}]);
    });
});

describe('a custom check returning a plain string', () => {
    it('is attributed to the field it is attached to', () => {
        const res = beanValidator.validate({username: 'admin'}, [
            new StringValidator('username', {check: (v) => (v === 'admin' ? 'cannot be admin' : null)})
        ]);
        expect(res.errors).toEqual([{field: 'username', message: 'cannot be admin'}]);
    });

    it('uses the field alias when one is set', () => {
        const res = beanValidator.validate({usr: 'admin'}, [
            new StringValidator('usr', {name: 'User Name', check: () => 'cannot be admin'})
        ]);
        expect(res.errors[0].field).toBe('User Name');
    });

    it('carries the nesting prefix', () => {
        const res = beanValidator.validate({user: {name: 'admin'}}, [
            new ObjectValidator('user', {
                rules: [new StringValidator('name', {check: () => 'cannot be admin'})]
            })
        ]);
        expect(res.errors[0].field).toBe('user.name');
    });

    // The old path split the string on the first colon to guess a field name,
    // which truncated any message that legitimately contained one.
    it('keeps a message that contains a colon intact', () => {
        const res = beanValidator.validate({t: 'x'}, [
            new StringValidator('t', {check: () => 'expected format: HH:mm'})
        ]);
        expect(res.errors).toEqual([{field: 't', message: 'expected format: HH:mm'}]);
    });

    it('passes a ValidationError object through untouched', () => {
        const custom: ValidationError = {field: 'somewhere.else', message: 'cross-field problem'};
        const res = beanValidator.validate({a: 'x'}, [new StringValidator('a', {check: () => custom})]);
        expect(res.errors).toEqual([custom]);
    });
});

describe('BooleanValidator numeric input', () => {
    const rules = [new BooleanValidator('flag', {})];

    it.each([[0, false], [1, true]])('accepts %p as %p', (input, expected) => {
        const data = {flag: input as unknown};
        expect(beanValidator.validate(data, rules).valid).toBe(true);
        expect(data.flag).toBe(expected);
    });

    // '42' has always been a type error; 42 quietly became true. Same value,
    // opposite verdict depending on how it was written.
    it.each([42, -1, 2.5, Infinity, -Infinity, NaN])('rejects %p', (input) => {
        const res = beanValidator.validate({flag: input}, rules);
        expect(res.valid).toBe(false);
        expect(res.errors[0].message).toBe('is not a valid boolean value');
    });

    it('agrees with the string form', () => {
        for (const n of [42, -1, 2.5]) {
            expect(beanValidator.validate({flag: n}, rules).valid)
                .toBe(beanValidator.validate({flag: String(n)}, rules).valid);
        }
    });

    it.each([[true, true], [false, false], ['true', true], ['FALSE', false], [' 1 ', true], ['0', false]])(
        'still accepts %p as %p', (input, expected) => {
            const data = {flag: input as unknown};
            expect(beanValidator.validate(data, rules).valid).toBe(true);
            expect(data.flag).toBe(expected);
        });
});
