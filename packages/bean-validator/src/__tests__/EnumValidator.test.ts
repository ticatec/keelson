import beanValidator, { EnumValidator } from '../index';

describe('EnumValidator', () => {
    test('should validate allowed enum values', () => {
        const rules = [new EnumValidator('role', { values: ['admin', 'user', 'guest'] })];
        
        expect(beanValidator.validate({ role: 'admin' }, rules).valid).toBe(true);
        expect(beanValidator.validate({ role: 'user' }, rules).valid).toBe(true);
        expect(beanValidator.validate({ role: 'other' }, rules).valid).toBe(false);
    });

    test('should handle missing or invalid values array defensibly', () => {
        // @ts-ignore
        const rules1 = [new EnumValidator('status', {})];
        const res1 = beanValidator.validate({ status: 'active' }, rules1);
        expect(res1.valid).toBe(false);

        // @ts-ignore
        const rules2 = [new EnumValidator('status', { values: null })];
        const res2 = beanValidator.validate({ status: 'active' }, rules2);
        expect(res2.valid).toBe(false);
    });
});
