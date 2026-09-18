import beanValidator, {
    StringValidator,
    NumberValidator,
    DateValidator,
    BooleanValidator,
    EnumValidator,
    ArrayValidator,
    ObjectValidator,
    BaseValidator
} from '../index';

type Make = (field: string, required: boolean) => BaseValidator;

const MAKERS: Array<[string, Make]> = [
    ['NumberValidator', (f, required) => new NumberValidator(f, {required})],
    ['DateValidator', (f, required) => new DateValidator(f, {required})],
    ['BooleanValidator', (f, required) => new BooleanValidator(f, {required})],
    ['EnumValidator', (f, required) => new EnumValidator(f, {required, values: ['a', 'b']})],
    ['ArrayValidator', (f, required) => new ArrayValidator(f, {required})],
    ['ObjectValidator', (f, required) => new ObjectValidator(f, {required, rules: []})]
];

describe('empty values', () => {
    // An untouched input in an HTML form posts '', not null. Reporting that as
    // "is not a valid number" tells the user nothing about what to do.
    describe.each(MAKERS)('%s', (_name, make) => {
        it.each(['', '   '])('reports %p on a required field as missing', (input) => {
            const res = beanValidator.validate({v: input}, [make('v', true)]);
            expect(res.valid).toBe(false);
            expect(res.errors).toHaveLength(1);
            expect(res.errors[0]).toEqual({field: 'v', message: 'cannot be empty'});
        });

        it.each(['', '   '])('skips %p on an optional field', (input) => {
            expect(beanValidator.validate({v: input}, [make('v', false)]).valid).toBe(true);
        });

        it('still reports a missing value on a required field', () => {
            const res = beanValidator.validate({}, [make('v', true)]);
            expect(res.errors[0].message).toBe('cannot be empty');
        });

        it('leaves the bean untouched when the value is skipped', () => {
            const data: Record<string, unknown> = {v: ''};
            beanValidator.validate(data, [make('v', false)]);
            expect(data).toEqual({v: ''});
        });
    });

    describe('StringValidator treats an empty string as a real value', () => {
        it('reports a required empty string as missing', () => {
            const res = beanValidator.validate({v: ''}, [new StringValidator('v', {required: true})]);
            expect(res.errors[0].message).toBe('cannot be empty');
        });

        it('reports a required whitespace-only string as missing once trimmed', () => {
            const res = beanValidator.validate({v: '   '}, [new StringValidator('v', {required: true})]);
            expect(res.errors[0].message).toBe('cannot be empty');
        });

        it('keeps whitespace when trim is disabled', () => {
            const data = {v: '   '};
            const res = beanValidator.validate(data, [new StringValidator('v', {required: true, trim: false})]);
            expect(res.valid).toBe(true);
            expect(data.v).toBe('   ');
        });

        it('still applies minLen to an optional empty string', () => {
            const res = beanValidator.validate({v: ''}, [new StringValidator('v', {minLen: 3})]);
            expect(res.valid).toBe(false);
            expect(res.errors[0].message).toBe('length must be at least 3 characters');
        });
    });

    describe('defaultValue still wins over emptiness', () => {
        it.each([[''], ['   '], [null], [undefined]])('replaces %p', (input) => {
            const data: Record<string, unknown> = {v: input};
            const res = beanValidator.validate(data, [new NumberValidator('v', {required: true, defaultValue: 42})]);
            expect(res.valid).toBe(true);
            expect(data.v).toBe(42);
        });

        it('applies to a missing key', () => {
            const data: Record<string, unknown> = {};
            beanValidator.validate(data, [new StringValidator('v', {defaultValue: 'fallback'})]);
            expect(data.v).toBe('fallback');
        });
    });

    describe('ignoreWhen still short-circuits everything', () => {
        it('skips a required empty field', () => {
            const rules = [new NumberValidator('v', {required: true, ignoreWhen: () => true})];
            expect(beanValidator.validate({v: ''}, rules).valid).toBe(true);
        });
    });
});
