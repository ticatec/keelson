import BaseValidator, {ValidatorOptions} from "./BaseValidator.js";
import ValidationResult from "./ValidationResult.js";
import {getMessage} from "./Locale.js";

/**
 * 十进制数字字面量：可带符号，整数、小数、科学计数法均可。
 * 刻意不接受十六进制（0x）、二进制（0b）、八进制（0o）与 Infinity。
 */
const DECIMAL_PATTERN = /^[+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:[eE][+-]?\d+)?$/;

export interface NumberValidatorOptions extends ValidatorOptions {
    minValue?: number,  //最小值
    maxValue?: number,  //最大值
    round?: number,     //保留小数位数
    roundMode?: 'ceil' | 'floor' | 'round'  //舍入模式
}


export default class NumberValidator extends BaseValidator {

    protected minValue?: number;
    protected maxValue?: number;
    protected round?: number;
    protected roundMode: 'ceil' | 'floor' | 'round';

    constructor(field: string, options: NumberValidatorOptions = {}) {
        super(field, options);
        this.minValue = options?.minValue;
        this.maxValue = options?.maxValue;
        this.round = options?.round;
        this.roundMode = options?.roundMode || 'round';
    }

    protected checkField(value: any, result: ValidationResult, prefix: string | null): boolean {
        const field = this.getFieldLabel(prefix);
        if (this.minValue != null && value < this.minValue) {
            result.appendError(this.createError(field, getMessage().NUMBER_SHORTAGE, {min: this.minValue}));
            return false;
        }
        if (this.maxValue != null && value > this.maxValue) {
            result.appendError(this.createError(field, getMessage().NUMBER_EXCEED, {max: this.maxValue}));
            return false;
        }
        return true;
    }

    protected checkType(value: any): any {
        if (typeof value === "number") {
            return Number.isFinite(value) ? value : null;
        }
        if (typeof value === "string") {
            const trimmed = value.trim();
            // 只接受十进制写法。此前用 Number(trimmed)，会把 '0x1f' 解析成 31、
            // '0b101' 解析成 5、'Infinity' 解析成 Infinity——而 Infinity 一旦被
            // 写回 bean，JSON.stringify 会变成 null，入库也会失败。
            if (!DECIMAL_PATTERN.test(trimmed)) {
                return null;
            }
            const num = Number(trimmed);
            return Number.isFinite(num) ? num : null;
        }
        return null;
    }

    protected getErrorType(): string {
        return getMessage().INVALID_NUMBER;
    }

    /**
     * 清理数字（舍入）
     * @param value
     * @protected
     */
    protected sanitize(value: any): any {
        if (typeof value === 'number' && this.round !== undefined) {
            const multiplier = Math.pow(10, this.round);
            switch (this.roundMode) {
                case 'ceil':
                    value = Math.ceil(value * multiplier) / multiplier;
                    break;
                case 'floor':
                    value = Math.floor(value * multiplier) / multiplier;
                    break;
                case 'round':
                default:
                    value = Math.round(value * multiplier) / multiplier;
                    break;
            }
        }
        return value;
    }

}