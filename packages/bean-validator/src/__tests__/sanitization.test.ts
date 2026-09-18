import beanValidator from '../lib/BeanValidator';
import {StringValidator, NumberValidator} from '../index';
import type {ValidationError} from '../index';

describe('Bean Validator - Sanitization Features', () => {

    describe('Default Value', () => {
        test('should apply default value for string when field is missing', () => {
            const data: any = {};
            const rules = [
                new StringValidator('status', {
                    defaultValue: 'pending'
                })
            ];

            const result = beanValidator.validate(data, rules);

            expect(result.valid).toBe(true);
            expect(data.status).toBe('pending');
        });

        test('should apply default value for string when field is null', () => {
            const data: any = { status: null };
            const rules = [
                new StringValidator('status', {
                    defaultValue: 'active'
                })
            ];

            const result = beanValidator.validate(data, rules);

            expect(result.valid).toBe(true);
            expect(data.status).toBe('active');
        });

        test('should apply default value for number', () => {
            const data: any = { quantity: null };
            const rules = [
                new NumberValidator('quantity', {
                    defaultValue: 1
                })
            ];

            const result = beanValidator.validate(data, rules);

            expect(result.valid).toBe(true);
            expect(data.quantity).toBe(1);
        });

        test('should not override existing value with default', () => {
            const data: any = { status: 'completed' };
            const rules = [
                new StringValidator('status', {
                    defaultValue: 'pending'
                })
            ];

            const result = beanValidator.validate(data, rules);

            expect(result.valid).toBe(true);
            expect(data.status).toBe('completed');
        });

        test('should work with default value and required together', () => {
            const data: any = {};
            const rules = [
                new StringValidator('status', {
                    required: true,
                    defaultValue: 'pending'
                })
            ];

            const result = beanValidator.validate(data, rules);

            expect(result.valid).toBe(true);
            expect(data.status).toBe('pending');
        });
    });

    describe('String Case Conversion', () => {
        test('should convert string to lowercase', () => {
            const data: any = { email: 'JOHN@EXAMPLE.COM' };
            const rules = [
                new StringValidator('email', {
                    toLowerCase: true
                })
            ];

            const result = beanValidator.validate(data, rules);

            expect(result.valid).toBe(true);
            expect(data.email).toBe('john@example.com');
        });

        test('should convert string to uppercase', () => {
            const data: any = { code: 'abc123' };
            const rules = [
                new StringValidator('code', {
                    toUpperCase: true
                })
            ];

            const result = beanValidator.validate(data, rules);

            expect(result.valid).toBe(true);
            expect(data.code).toBe('ABC123');
        });

        test('should apply toLowerCase after trim', () => {
            const data: any = { email: '  JOHN@EXAMPLE.COM  ' };
            const rules = [
                new StringValidator('email', {
                    toLowerCase: true
                })
            ];

            const result = beanValidator.validate(data, rules);

            expect(result.valid).toBe(true);
            expect(data.email).toBe('john@example.com');
        });

        test('should not convert if both toLowerCase and toUpperCase are false', () => {
            const data: any = { text: 'MiXeD CaSe' };
            const rules = [
                new StringValidator('text', {})
            ];

            const result = beanValidator.validate(data, rules);

            expect(result.valid).toBe(true);
            expect(data.text).toBe('MiXeD CaSe');
        });

        test('should work with defaultValue and toLowerCase', () => {
            const data: any = {};
            const rules = [
                new StringValidator('email', {
                    defaultValue: 'DEFAULT@EXAMPLE.COM',
                    toLowerCase: true
                })
            ];

            const result = beanValidator.validate(data, rules);

            expect(result.valid).toBe(true);
            expect(data.email).toBe('default@example.com');
        });
    });

    describe('Number Rounding', () => {
        test('should round number to 2 decimal places (default round mode)', () => {
            const data: any = { price: 99.876 };
            const rules = [
                new NumberValidator('price', {
                    round: 2,
                    roundMode: 'round'
                })
            ];

            const result = beanValidator.validate(data, rules);

            expect(result.valid).toBe(true);
            expect(data.price).toBe(99.88);
        });

        test('should ceil number to 2 decimal places', () => {
            const data: any = { price: 99.871 };
            const rules = [
                new NumberValidator('price', {
                    round: 2,
                    roundMode: 'ceil'
                })
            ];

            const result = beanValidator.validate(data, rules);

            expect(result.valid).toBe(true);
            expect(data.price).toBe(99.88);
        });

        test('should floor number to 2 decimal places', () => {
            const data: any = { price: 99.879 };
            const rules = [
                new NumberValidator('price', {
                    round: 2,
                    roundMode: 'floor'
                })
            ];

            const result = beanValidator.validate(data, rules);

            expect(result.valid).toBe(true);
            expect(data.price).toBe(99.87);
        });

        test('should round to 0 decimal places (integer)', () => {
            const data: any = { quantity: 3.7 };
            const rules = [
                new NumberValidator('quantity', {
                    round: 0,
                    roundMode: 'round'
                })
            ];

            const result = beanValidator.validate(data, rules);

            expect(result.valid).toBe(true);
            expect(data.quantity).toBe(4);
        });

        test('should not round if round is not specified', () => {
            const data: any = { value: 99.87654321 };
            const rules = [
                new NumberValidator('value', {})
            ];

            const result = beanValidator.validate(data, rules);

            expect(result.valid).toBe(true);
            expect(data.value).toBe(99.87654321);
        });

        test('should work with defaultValue and round', () => {
            const data: any = {};
            const rules = [
                new NumberValidator('price', {
                    defaultValue: 99.876,
                    round: 2,
                    roundMode: 'round'
                })
            ];

            const result = beanValidator.validate(data, rules);

            expect(result.valid).toBe(true);
            expect(data.price).toBe(99.88);
        });

        test('should round after type conversion', () => {
            const data: any = { price: '99.876' };
            const rules = [
                new NumberValidator('price', {
                    round: 2,
                    roundMode: 'round'
                })
            ];

            const result = beanValidator.validate(data, rules);

            expect(result.valid).toBe(true);
            expect(data.price).toBe(99.88);
            expect(typeof data.price).toBe('number');
        });
    });

    describe('Combined Sanitization', () => {
        test('should apply multiple sanitizations together', () => {
            const data: any = {
                email: '  USER@EXAMPLE.COM  ',
                status: null,
                price: '99.876',
                quantity: null
            };

            const rules = [
                new StringValidator('email', { toLowerCase: true }),
                new StringValidator('status', { defaultValue: 'active', toUpperCase: true }),
                new NumberValidator('price', { round: 2 }),
                new NumberValidator('quantity', { defaultValue: 1, round: 0 })
            ];

            const result = beanValidator.validate(data, rules);

            expect(result.valid).toBe(true);
            expect(data.email).toBe('user@example.com');
            expect(data.status).toBe('ACTIVE');
            expect(data.price).toBe(99.88);
            expect(data.quantity).toBe(1);
        });
    });

    describe('Field Name Alias', () => {
        test('should use field alias in error message', () => {
            const data: any = { usr_email: '' };
            const rules = [
                new StringValidator('usr_email', {
                    name: 'Email Address',
                    required: true
                })
            ];

            const result = beanValidator.validate(data, rules);

            expect(result.valid).toBe(false);
            expect(result.errors).toHaveLength(1);
            expect(result.errors[0].field).toBe('Email Address');
            expect(result.errors[0].message).toContain('cannot be empty');
        });

        test('should use field name when alias is not provided', () => {
            const data: any = { email: '' };
            const rules = [
                new StringValidator('email', {
                    required: true
                })
            ];

            const result = beanValidator.validate(data, rules);

            expect(result.valid).toBe(false);
            expect(result.errors[0].field).toBe('email');
        });
    });

    describe('Structured Error Object', () => {
        test('should return structured error objects', () => {
            const data: any = {
                email: 'invalid',
                age: 150,
                price: -10
            };

            const rules = [
                new StringValidator('email', {
                    name: 'Email',
                    required: true,
                    maxLen: 5
                }),
                new NumberValidator('age', {
                    name: 'Age',
                    maxValue: 120
                }),
                new NumberValidator('price', {
                    name: 'Price',
                    minValue: 0
                })
            ];

            const result = beanValidator.validate(data, rules);

            expect(result.valid).toBe(false);
            expect(result.errors).toBeInstanceOf(Array);
            expect(result.errors.length).toBeGreaterThan(0);

            result.errors.forEach((error: ValidationError) => {
                expect(error).toHaveProperty('field');
                expect(error).toHaveProperty('message');
                expect(typeof error.field).toBe('string');
                expect(typeof error.message).toBe('string');
            });
        });

        test('should maintain backward compatibility with errorMessage', () => {
            const data: any = { age: 150 };
            const rules = [
                new NumberValidator('age', {
                    name: 'Age',
                    maxValue: 120
                })
            ];

            const result = beanValidator.validate(data, rules);

            expect(result.valid).toBe(false);
            expect(typeof result.errorMessage).toBe('string');
            expect(result.errorMessage).toContain('Age');
            expect(result.errorMessage).toContain('120');
        });

        test('should allow iteration over errors', () => {
            const data: any = {
                field1: '',
                field2: ''
            };

            const rules = [
                new StringValidator('field1', { name: 'Field 1', required: true }),
                new StringValidator('field2', { name: 'Field 2', required: true })
            ];

            const result = beanValidator.validate(data, rules);

            expect(result.valid).toBe(false);
            expect(result.errors.length).toBe(2);

            result.errors.forEach((error: ValidationError, index: number) => {
                expect(error.field).toBe(`Field ${index + 1}`);
            });
        });
    });

    describe('Edge Cases', () => {
        test('should handle empty string with default value', () => {
            const data: any = { status: '' };
            const rules = [
                new StringValidator('status', {
                    defaultValue: 'active'
                })
            ];

            const result = beanValidator.validate(data, rules);

            expect(result.valid).toBe(true);
            expect(data.status).toBe('active');
        });

        test('should handle zero with default value', () => {
            const data: any = { value: 0 };
            const rules = [
                new NumberValidator('value', {
                    defaultValue: 10
                })
            ];

            const result = beanValidator.validate(data, rules);

            expect(result.valid).toBe(true);
            expect(data.value).toBe(0);
        });

        test('should handle negative number rounding', () => {
            const data: any = { value: -99.876 };
            const rules = [
                new NumberValidator('value', {
                    round: 2,
                    roundMode: 'round'
                })
            ];

            const result = beanValidator.validate(data, rules);

            expect(result.valid).toBe(true);
            expect(data.value).toBe(-99.88);
        });

        test('should handle very small decimal rounding', () => {
            const data: any = { value: 0.0005 };
            const rules = [
                new NumberValidator('value', {
                    round: 4,
                    roundMode: 'round'
                })
            ];

            const result = beanValidator.validate(data, rules);

            expect(result.valid).toBe(true);
            expect(data.value).toBeCloseTo(0.0005, 4);
        });
    });
});