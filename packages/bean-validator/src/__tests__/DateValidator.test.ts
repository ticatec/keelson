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

    // 此前这个用例用 now - 10*86400000 构造边界值，而校验器内部又重新取了一次
    // now，两次取值相差 1ms 结果就会翻转：单独跑必过，并发跑必挂。现在边界按整
    // 日截断，「10 天前的任意时刻」都在范围内。
    test('maxDaysBefore is a whole-day boundary, not a moving millisecond', () => {
        const rules = [new DateValidator('eventDate', { maxDaysBefore: 10 })];

        const tenDaysAgo = new Date();
        tenDaysAgo.setDate(tenDaysAgo.getDate() - 10);

        // 当天最早与最晚的时刻都应通过
        const startOfThatDay = new Date(tenDaysAgo);
        startOfThatDay.setHours(0, 0, 0, 0);
        const endOfThatDay = new Date(tenDaysAgo);
        endOfThatDay.setHours(23, 59, 59, 999);

        expect(beanValidator.validate({ eventDate: startOfThatDay }, rules).valid).toBe(true);
        expect(beanValidator.validate({ eventDate: endOfThatDay }, rules).valid).toBe(true);

        const elevenDaysAgo = new Date();
        elevenDaysAgo.setDate(elevenDaysAgo.getDate() - 11);
        const res = beanValidator.validate({ eventDate: elevenDaysAgo }, rules);
        expect(res.valid).toBe(false);
        expect(res.errors[0].message).toContain('date cannot be earlier than');
    });

    test('the same value validates identically no matter when it is checked', () => {
        const rules = [new DateValidator('eventDate', { maxDaysBefore: 10 })];
        const boundary = new Date();
        boundary.setDate(boundary.getDate() - 10);

        const first = beanValidator.validate({ eventDate: new Date(boundary) }, rules).valid;
        const start = Date.now();
        while (Date.now() - start < 5) { /* 模拟并发跑测试时的调度延迟 */ }
        const second = beanValidator.validate({ eventDate: new Date(boundary) }, rules).valid;

        expect(second).toBe(first);
        expect(first).toBe(true);
    });

    test('maxDaysAfter is a whole-day boundary', () => {
        const rules = [new DateValidator('eventDate', { maxDaysAfter: 10 })];

        const tenDaysLater = new Date();
        tenDaysLater.setDate(tenDaysLater.getDate() + 10);

        const startOfThatDay = new Date(tenDaysLater);
        startOfThatDay.setHours(0, 0, 0, 0);
        const endOfThatDay = new Date(tenDaysLater);
        endOfThatDay.setHours(23, 59, 59, 999);

        expect(beanValidator.validate({ eventDate: startOfThatDay }, rules).valid).toBe(true);
        expect(beanValidator.validate({ eventDate: endOfThatDay }, rules).valid).toBe(true);

        const elevenDaysLater = new Date();
        elevenDaysLater.setDate(elevenDaysLater.getDate() + 11);
        const res = beanValidator.validate({ eventDate: elevenDaysLater }, rules);
        expect(res.valid).toBe(false);
        expect(res.errors[0].message).toContain('final date cannot exceed');
    });

    test('from / to stay exact instants rather than whole days', () => {
        const from = new Date('2026-06-15T12:00:00.000Z');
        const rules = [new DateValidator('eventDate', { from })];
        expect(beanValidator.validate({ eventDate: new Date('2026-06-15T11:59:59.999Z') }, rules).valid).toBe(false);
        expect(beanValidator.validate({ eventDate: new Date('2026-06-15T12:00:00.000Z') }, rules).valid).toBe(true);
    });
});
