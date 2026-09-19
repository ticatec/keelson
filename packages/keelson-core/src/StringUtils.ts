import { v7 as uuidv7 } from 'uuid';

/**
 * Checks if a string is empty (null, undefined, or whitespace only).
 * @param s - Value to check.
 * @returns True if empty.
 */
const isEmpty = (s: unknown): boolean => {
    return s == null || (typeof s == 'string' && s.trim().length === 0);
};

/**
 * Generates a 32-character UUID v7 with hyphens removed.
 *
 * UUID v7 embeds a 48-bit millisecond timestamp in its leading bits, so generated
 * values are time-ordered. Stripping the hyphens preserves that ordering, which makes
 * the result well suited as a database primary key: inserts stay local in the B-tree
 * index instead of scattering like random v4 values.
 *
 * @returns 32-character unhyphenated UUID v7 string.
 */
const genID = (): string => {
    return uuidv7().replace(/-/g, '');
};

/**
 * Pads a string on the left with a prefix character up to the specified target length.
 * @param s - Target string.
 * @param prefix - Padding prefix character.
 * @param len - Desired length.
 * @returns Left-padded string.
 */
const leftPad = (s: string, prefix: string, len: number): string => {
    if (len <= 0 || s.length >= len) {
        return s;
    }
    const diffLen = len - s.length;
    return prefix.repeat(diffLen) + s;
};

/**
 * Generates a standard UUID v7 string (including hyphens).
 *
 * Values are time-ordered and monotonic within the same millisecond (RFC 9562 counter
 * method), so a burst of identifiers generated in a tight loop stays strictly increasing.
 *
 * Note: a v7 identifier exposes its creation timestamp. Do not use it where that
 * disclosure matters, or where the value must be unguessable (tokens, reset links).
 *
 * @returns Standard UUID v7 string.
 */
const uuid = (): string => {
    return uuidv7();
};

/**
 * Checks if a value is a string.
 * @param s - Value to check.
 * @returns True if value is a string.
 */
const isString = (s: unknown): boolean => {
    return typeof s === 'string';
};

/**
 * Checks if a string formatted value represents a valid number.
 * @param s - Value to check.
 * @returns True if formatted as a number.
 */
const isNumber = (s: unknown): boolean => {
    // 必须先排除空串与纯空白：JavaScript 里 Number('') 与 Number('   ') 都等于 0，
    // 于是 !isNaN(...) 成立，空值会被当成合法数字（通常被后续逻辑理解为 0）。
    return isString(s) && (s as string).trim().length > 0 && !isNaN(Number(s));
};

/**
 * Parses a string into an integer number, returning a default fallback value if parsing fails.
 * @param s - Value to parse.
 * @param defValue - Default fallback value if parsing fails (defaults to 0).
 * @returns Parsed integer value.
 */
const parseNumber = (s: unknown, defValue: number = 0): number => {
    if (typeof s === 'number') {
        return isNaN(s) ? defValue : Math.floor(s);
    }
    if (isNumber(s)) {
        const parsed = parseInt(s as string, 10);
        return isNaN(parsed) ? defValue : parsed;
    }
    return defValue;
};

interface StringUtilsUtils {
    isEmpty(s: unknown): boolean;
    genID(): string;
    uuid(): string;
    leftPad(s: string, prefix: string, len: number): string;
    isString(s: unknown): boolean;
    isNumber(s: unknown): boolean;
    parseNumber(s: unknown, defValue?: number): number;
}

const StringUtils: StringUtilsUtils = {
    isEmpty,
    genID,
    uuid,
    leftPad,
    isString,
    isNumber,
    parseNumber
};

export default StringUtils;
