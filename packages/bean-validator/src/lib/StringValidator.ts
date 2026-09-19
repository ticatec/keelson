import BaseValidator, {ValidatorOptions} from "./BaseValidator.js";
import ValidationResult from "./ValidationResult.js";
import {getMessage} from "./Locale.js";

interface StringFormat {
    regex: RegExp, //正则表达式
    message: string
}

export interface StringValidatorOptions extends ValidatorOptions {
    minLen?: number,  //最小长度
    maxLen?: number,  //最大长度
    format?: StringFormat,
    toLowerCase?: boolean,  //转小写
    toUpperCase?: boolean,  //转大写
    trim?: boolean   //是否自动去除前后空格，默认为 true
}

export default class StringValidator extends BaseValidator {

    protected maxLen?: number;
    protected minLen?: number;
    protected format?: StringFormat;
    protected toLowerCase: boolean;
    protected toUpperCase: boolean;
    protected trim: boolean;

    constructor(field: string, options: StringValidatorOptions = {}) {
        super(field, options);
        this.minLen = options?.minLen;
        this.maxLen = options?.maxLen;
        this.format = options?.format;
        this.toLowerCase = options?.toLowerCase || false;
        this.toUpperCase = options?.toUpperCase || false;
        this.trim = options?.trim !== undefined ? options.trim : true;
    }

    /**
     * 对字符串而言空字符串是一个真实的值，仍需交由 required / minLen / format 处理。
     * @protected
     */
    protected acceptsEmptyString(): boolean {
        return true;
    }

    protected checkType(value: any): any {
        if (!this.isValidString(value)) {
            return null;
        }
        const str = value.toString();
        return this.trim ? str.trim() : str;
    }

    protected getErrorType(): string {
        return getMessage().INVALID_STRING;
    }

    protected checkField(value: any, result: ValidationResult, prefix: string | null): boolean {
        const field = this.getFieldLabel(prefix);
        if (value.length == 0) {
            if (this.required) {
                result.appendError(this.createError(field, getMessage().REQUIRED));
                return false;
            }
            // 非必填字段留空就是没填，不应该再触发 minLen 与 format。
            // 此前 { website: '' } 会被 format 判为「网址格式不正确」、
            // { bio: '' } 会被 minLen 判为长度不足——而同样一个字段只要把键去掉
            // 就能通过，两者行为并不一致。
            return true;
        }
        if (this.minLen != null && value.length < this.minLen) {
            result.appendError(this.createError(field, getMessage().STRING_LENGTH_SHORTAGE, {minLength: this.minLen}));
            return false;
        }
        if (this.maxLen != null && value.length > this.maxLen) {
            result.appendError(this.createError(field, getMessage().STRING_LENGTH_EXCEED, {maxLength: this.maxLen}));
            return false;
        }
        if (this.format != null && this.format.regex != null && value.match(this.format.regex) == null) {
            result.appendError({
                field,
                message: this.format.message
            });
            return false;
        }
        return true;
    }

    /**
     * 是不是一个有效的字符串
     * @param value
     * @protected
     */
    protected isValidString(value: any): boolean {
        const t = typeof value;
        return t == 'number' || t == 'string';
    }

    /**
     * 清理字符串（大小写转换）
     * @param value
     * @protected
     */
    protected sanitize(value: any): any {
        if (typeof value === 'string') {
            if (this.toLowerCase) {
                value = value.toLowerCase();
            } else if (this.toUpperCase) {
                value = value.toUpperCase();
            }
        }
        return value;
    }


}