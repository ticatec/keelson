import StringUtils from '../StringUtils.js';

const UUID_V7 = /^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

describe('StringUtils', () => {

    describe('uuid() / genID() produce UUID v7', () => {

        test('uuid() returns a canonical v7 string', () => {
            const value = StringUtils.uuid();
            expect(value).toMatch(UUID_V7);
            expect(value.length).toBe(36);
        });

        test('genID() returns the same value without hyphens', () => {
            const value = StringUtils.genID();
            expect(value.length).toBe(32);
            expect(value).toMatch(/^[0-9a-f]{32}$/);
            // version nibble sits at index 12 once the hyphens are removed
            expect(value[12]).toBe('7');
        });

        test('values generated in the same millisecond stay strictly increasing', () => {
            const ids = Array.from({ length: 50 }, () => StringUtils.uuid());
            for (let i = 1; i < ids.length; i++) {
                expect(ids[i] > ids[i - 1]).toBe(true);
            }
        });

        test('genID() keeps lexicographic ordering after hyphen removal', () => {
            const ids = Array.from({ length: 50 }, () => StringUtils.genID());
            const sorted = [...ids].sort();
            expect(ids).toEqual(sorted);
        });

        test('the leading bits encode the current timestamp', () => {
            const before = Date.now();
            const value = StringUtils.uuid();
            const after = Date.now();
            const millis = parseInt(value.slice(0, 8) + value.slice(9, 13), 16);
            expect(millis).toBeGreaterThanOrEqual(before);
            expect(millis).toBeLessThanOrEqual(after);
        });

        test('values are unique', () => {
            const ids = new Set(Array.from({ length: 1000 }, () => StringUtils.genID()));
            expect(ids.size).toBe(1000);
        });
    });

    describe('isEmpty', () => {
        test.each([
            [null, true],
            [undefined, true],
            ['', true],
            ['   ', true],
            ['a', false],
            [0, false]
        ])('isEmpty(%p) === %p', (input, expected) => {
            expect(StringUtils.isEmpty(input)).toBe(expected);
        });
    });

    describe('isString / isNumber', () => {
        test('isString', () => {
            expect(StringUtils.isString('abc')).toBe(true);
            expect(StringUtils.isString(123)).toBe(false);
            expect(StringUtils.isString(null)).toBe(false);
        });

        test('isNumber only accepts numeric strings', () => {
            expect(StringUtils.isNumber('123')).toBe(true);
            expect(StringUtils.isNumber('12.5')).toBe(true);
            expect(StringUtils.isNumber('abc')).toBe(false);
            expect(StringUtils.isNumber(123)).toBe(false);
        });
    });

    describe('parseNumber', () => {
        test('parses numeric strings and floors numbers', () => {
            expect(StringUtils.parseNumber('42')).toBe(42);
            expect(StringUtils.parseNumber(42.9)).toBe(42);
        });

        test('falls back when the value cannot be parsed', () => {
            expect(StringUtils.parseNumber('abc', 7)).toBe(7);
            expect(StringUtils.parseNumber(null, 7)).toBe(7);
            expect(StringUtils.parseNumber(undefined)).toBe(0);
            expect(StringUtils.parseNumber(NaN, 7)).toBe(7);
        });
    });

    describe('leftPad', () => {
        test('pads up to the requested length', () => {
            expect(StringUtils.leftPad('45', '0', 4)).toBe('0045');
        });

        test('returns the input untouched when it is already long enough', () => {
            expect(StringUtils.leftPad('12345', '0', 4)).toBe('12345');
            expect(StringUtils.leftPad('45', '0', 0)).toBe('45');
        });
    });
});
