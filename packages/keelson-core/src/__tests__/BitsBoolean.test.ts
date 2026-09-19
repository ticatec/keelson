import BitsBoolean from '../BitsBoolean.js';
import StringUtils from '../StringUtils.js';

class TestBitsBoolean extends BitsBoolean {
    constructor(value: number = 0) {
        super(value);
    }
    public setBit(pos: number, val: boolean) { this.setBitValue(pos, val); }
    public getBit(pos: number) { return this.getBitValue(pos); }
    public getValue() { return this.value; }
}

describe('BitsBoolean & StringUtils', () => {
    test('BitsBoolean should set and get bit positions correctly with unsigned 32-bit safety', () => {
        const bits = new TestBitsBoolean();
        bits.setBit(0, true);
        bits.setBit(3, true);

        expect(bits.getBit(0)).toBe(true);
        expect(bits.getBit(1)).toBe(false);
        expect(bits.getBit(3)).toBe(true);
        expect(bits.getValue()).toBe(9); // 1 + 8

        const boolArray = bits.toBooleanArray(4);
        expect(boolArray).toEqual([true, false, false, true]);

        const num = BitsBoolean.fromBooleanArray([true, false, false, true]);
        expect(num).toBe(9);
    });

    test('StringUtils should safely parse numbers and pad strings', () => {
        expect(StringUtils.isEmpty('')).toBe(true);
        expect(StringUtils.isEmpty('   ')).toBe(true);
        expect(StringUtils.isEmpty('abc')).toBe(false);

        expect(StringUtils.leftPad('45', '0', 4)).toBe('0045');
        expect(StringUtils.parseNumber('123')).toBe(123);
        expect(StringUtils.parseNumber('invalid', 99)).toBe(99);

        const id1 = StringUtils.genID();
        const id2 = StringUtils.genID();
        expect(id1).toHaveLength(32);
        expect(id1).not.toBe(id2);
    });
});
