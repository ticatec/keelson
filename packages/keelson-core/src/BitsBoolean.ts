export default abstract class BitsBoolean {

    protected value: number;
    protected constructor(value: number = 0) {
        this.value = (Math.floor(value) >>> 0);
    }

    /**
     * Sets the bit at the specified position to true or false (0-30).
     * @param pos - Bit position (0-30).
     * @param value - Boolean value to set.
     * @protected
     */
    protected setBitValue(pos: number, value: boolean): void {
        if (pos < 0 || pos > 30) {
            throw new Error("Invalid bit position. Must be between 0 and 30.");
        }
        if (value) {
            this.value = ((this.value | (1 << pos)) >>> 0);
        } else {
            this.value = ((this.value & ~(1 << pos)) >>> 0);
        }
    }

    /**
     * Reads the bit value at the specified position.
     * @param pos - Bit position (0-30).
     * @protected
     * @returns Boolean value at the specified bit position.
     */
    protected getBitValue(pos: number): boolean {
        if (pos < 0 || pos > 30) {
            throw new Error("Invalid bit position. Must be between 0 and 30.");
        }
        return (this.value & (1 << pos)) !== 0;
    }

    /**
     * Creates a bitfield number from a boolean array.
     * @param boolArray - Array of boolean values (up to 31 elements).
     * @static
     * @returns Number resulting from bitwise operations.
     */
    static fromBooleanArray(boolArray: boolean[]): number {
        let result = 0;

        for (let i = 0; i < Math.min(boolArray.length, 31); i++) {
            if (boolArray[i]) {
                result |= (1 << i);
            }
        }

        return (result >>> 0);
    }

    /**
     * Converts the current bitfield value into a boolean array.
     * @param length - Length of the output boolean array.
     * @returns Array of boolean values.
     */
    toBooleanArray(length: number): boolean[] {
        const result: boolean[] = [];

        for (let i = 0; i < length; i++) {
            result.push(this.getBitValue(i));
        }

        return result;
    }
}