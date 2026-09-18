import beanValidator, { StringValidator } from '../index';

describe('StringValidator', () => {
    test('should default trim: true and strip leading/trailing whitespace', () => {
        const rules = [new StringValidator('username', { required: true })];
        const data = { username: '   john_doe   ' };
        const res = beanValidator.validate(data, rules);
        expect(res.valid).toBe(true);
        expect(data.username).toBe('john_doe');
    });

    test('should allow trim: false to preserve leading/trailing whitespace', () => {
        const rules = [new StringValidator('password', { required: true, trim: false })];
        const data = { password: '  secret  ' };
        const res = beanValidator.validate(data, rules);
        expect(res.valid).toBe(true);
        expect(data.password).toBe('  secret  ');
    });

    test('should validate minLen and maxLen', () => {
        const rules = [new StringValidator('code', { minLen: 3, maxLen: 5 })];

        expect(beanValidator.validate({ code: 'ab' }, rules).valid).toBe(false);
        expect(beanValidator.validate({ code: 'abc' }, rules).valid).toBe(true);
        expect(beanValidator.validate({ code: 'abcde' }, rules).valid).toBe(true);
        expect(beanValidator.validate({ code: 'abcdef' }, rules).valid).toBe(false);
    });

    test('should convert case with toLowerCase and toUpperCase', () => {
        const rulesLower = [new StringValidator('email', { toLowerCase: true })];
        const dataLower = { email: 'USER@EXAMPLE.COM' };
        expect(beanValidator.validate(dataLower, rulesLower).valid).toBe(true);
        expect(dataLower.email).toBe('user@example.com');

        const rulesUpper = [new StringValidator('code', { toUpperCase: true })];
        const dataUpper = { code: 'abc' };
        expect(beanValidator.validate(dataUpper, rulesUpper).valid).toBe(true);
        expect(dataUpper.code).toBe('ABC');
    });

    test('should validate regex format', () => {
        const rules = [
            new StringValidator('phone', {
                format: {
                    regex: /^\d{3}-\d{4}$/,
                    message: 'Invalid phone format'
                }
            })
        ];

        expect(beanValidator.validate({ phone: '123-4567' }, rules).valid).toBe(true);
        const res = beanValidator.validate({ phone: '1234567' }, rules);
        expect(res.valid).toBe(false);
        expect(res.errors[0].message).toBe('Invalid phone format');
    });
});
