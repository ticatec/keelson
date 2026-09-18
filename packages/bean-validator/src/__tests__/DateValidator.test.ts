import beanValidator, { DateValidator } from '../index';

describe('DateValidator', () => {
    test('should validate valid date string and Date object', () => {
        const rules = [new DateValidator('dob', { required: true })];
        const data1 = { dob: '2023-01-01' };
        const res1 = beanValidator.validate(data1, rules);
        expect(res1.valid).toBe(true);
        expect(data1.dob).toBeInstanceOf(Date);

        const data2 = { dob: new Date('2023-01-01') };
        const res2 = beanValidator.validate(data2, rules);
        expect(res2.valid).toBe(true);
    });

    test('should reject invalid date string', () => {
        const rules = [new DateValidator('dob', { required: true })];
        const data = { dob: 'invalid-date-string' };
        const res = beanValidator.validate(data, rules);
        expect(res.valid).toBe(false);
        expect(res.errors[0].message).toContain('is not a valid date');
    });

    test('should correctly calculate maxDaysBefore with 86400000 ms per day', () => {
        const now = new Date();
        const tenDaysAgo = new Date(now.getTime() - 10 * 86400000);
        const elevenDaysAgo = new Date(now.getTime() - 11 * 86400000);

        const rules = [new DateValidator('eventDate', { maxDaysBefore: 10 })];

        const dataValid = { eventDate: tenDaysAgo };
        expect(beanValidator.validate(dataValid, rules).valid).toBe(true);

        const dataInvalid = { eventDate: elevenDaysAgo };
        const res = beanValidator.validate(dataInvalid, rules);
        expect(res.valid).toBe(false);
        expect(res.errors[0].message).toContain('date cannot be earlier than');
    });

    test('should validate maxDaysAfter', () => {
        const now = new Date();
        const tenDaysLater = new Date(now.getTime() + 10 * 86400000);
        const elevenDaysLater = new Date(now.getTime() + 11 * 86400000);

        const rules = [new DateValidator('eventDate', { maxDaysAfter: 10 })];

        const dataValid = { eventDate: tenDaysLater };
        expect(beanValidator.validate(dataValid, rules).valid).toBe(true);

        const dataInvalid = { eventDate: elevenDaysLater };
        const res = beanValidator.validate(dataInvalid, rules);
        expect(res.valid).toBe(false);
        expect(res.errors[0].message).toContain('final date cannot exceed');
    });
});
