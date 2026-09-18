import beanValidator, { NumberValidator } from '../index';

describe('NumberValidator', () => {
    test('should validate valid numbers and convert numeric strings', () => {
        const rules = [new NumberValidator('age', { required: true, minValue: 18 })];
        const data1 = { age: '25' };
        const res1 = beanValidator.validate(data1, rules);
        expect(res1.valid).toBe(true);
        expect(data1.age).toBe(25);

        const data2 = { age: 30 };
        const res2 = beanValidator.validate(data2, rules);
        expect(res2.valid).toBe(true);
    });

    test('should reject empty strings or whitespace strings', () => {
        const rules = [new NumberValidator('score', { required: true })];
        const data1 = { score: '' };
        const res1 = beanValidator.validate(data1, rules);
        expect(res1.valid).toBe(false);
        expect(res1.errors[0].message).toContain('is not a valid number');

        const data2 = { score: '   ' };
        const res2 = beanValidator.validate(data2, rules);
        expect(res2.valid).toBe(false);
        expect(res2.errors[0].message).toContain('is not a valid number');
    });

    test('should reject boolean inputs', () => {
        const rules = [new NumberValidator('count', { required: true, minValue: 0 })];
        const dataTrue = { count: true };
        const resTrue = beanValidator.validate(dataTrue, rules);
        expect(resTrue.valid).toBe(false);
        expect(resTrue.errors[0].message).toContain('is not a valid number');

        const dataFalse = { count: false };
        const resFalse = beanValidator.validate(dataFalse, rules);
        expect(resFalse.valid).toBe(false);
        expect(resFalse.errors[0].message).toContain('is not a valid number');
    });

    test('should reject invalid strings like "123abc"', () => {
        const rules = [new NumberValidator('amount', { required: true })];
        const data = { amount: '123abc' };
        const res = beanValidator.validate(data, rules);
        expect(res.valid).toBe(false);
        expect(res.errors[0].message).toContain('is not a valid number');
    });

    test('should validate min and max boundaries', () => {
        const rules = [new NumberValidator('val', { minValue: 10, maxValue: 100 })];
        expect(beanValidator.validate({ val: 5 }, rules).valid).toBe(false);
        expect(beanValidator.validate({ val: 10 }, rules).valid).toBe(true);
        expect(beanValidator.validate({ val: 50 }, rules).valid).toBe(true);
        expect(beanValidator.validate({ val: 100 }, rules).valid).toBe(true);
        expect(beanValidator.validate({ val: 101 }, rules).valid).toBe(false);
    });
});
