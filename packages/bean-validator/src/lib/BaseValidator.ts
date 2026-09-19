import ValidationResult, {ValidationError} from "./ValidationResult.js";
import {getMessage} from "./Locale.js";

/**
 * 自定义校验
 */
export type CustomCheck = (value: any, data: any, prefix: string | null) => any;

/**
 * 忽略条件
 */
export type IgnoreCheck = (value: any, data: any) => boolean;

interface Params {
    [key: string]: string | number;
}

export interface ValidatorOptions {
    required?: boolean | null,
    check?: CustomCheck | null,
    ignoreWhen?: IgnoreCheck | null,
    name?: string | null,
    defaultValue?: any
}

export default abstract class BaseValidator {

    protected field: string;
    protected checkFun?: CustomCheck;
    protected required: boolean;
    protected ignoreWhen?: IgnoreCheck;
    protected name?: string;
    protected defaultValue: any;

    protected constructor(field: string, options: ValidatorOptions = {}) {
        this.field = field;
        this.required = options?.required == true;
        this.checkFun = options?.check ?? undefined;
        this.ignoreWhen = options?.ignoreWhen ?? undefined;
        this.name = options?.name ?? undefined;
        this.defaultValue = options?.defaultValue;
    }

    /**
     * 检查非空
     * @param value
     * @param result
     * @param prefix
     * @protected
     */
    protected checkMandatory(value: any, result: ValidationResult,  prefix: string | null) {
        if (this.required) {
            const field = this.getFieldLabel(prefix);
            result.appendError(this.createError(field, getMessage().REQUIRED));
        }
    }

    /**
     * 子类是否把空字符串当作一个需要继续校验的值。
     *
     * 默认为 false：对数字、日期、布尔、枚举等类型而言，空字符串就是「没填」，
     * 因此必填时报「不能为空」，非必填时直接跳过——而不是报「不是有效的数字」。
     * 表单里未填写的输入框提交上来的正是空字符串，这是最常见的情形。
     *
     * StringValidator 覆盖为 true：对字符串而言空字符串是一个真实的值，
     * 仍需交由 minLen / format 等规则处理。
     * @protected
     */
    protected acceptsEmptyString(): boolean {
        return false;
    }

    validate(data: any, result: ValidationResult, prefix: string | null = null) {
        let value = this.extractFieldValue(data);
        const ignore = this.ignoreWhen ? this.ignoreWhen(value, data) : false;
        if (!ignore) {
            // 处理空字符串的情况。对于不把空字符串当作有效值的校验器（数字、日期、
            // 布尔、枚举等），只含空白的字符串同样视为未填写——StringValidator 在
            // trim 之后本来就是这个行为，这里让其余校验器与之一致。
            const isBlank = typeof value === 'string'
                && (value === '' || (!this.acceptsEmptyString() && value.trim() === ''));
            const isEmpty = value == null || isBlank;

            if (isEmpty) {
                // 应用默认值
                if (this.defaultValue !== undefined) {
                    value = this.defaultValue;
                    this.setFieldValue(data, value);
                    // 继续处理默认值
                } else if (value == null || !this.acceptsEmptyString()) {
                    // 视为未填写：必填则报必填，非必填直接跳过
                    this.checkMandatory(value, result, prefix);
                    return;
                }
                // 空字符串对字符串校验器仍是有效值，继续执行验证
            }

            const tv = this.checkType(value);
            if (tv == null) {
                const field = this.getFieldLabel(prefix);
                result.appendError(this.createError(field, this.getErrorType()));
            } else {
                if (tv !== value) {
                    value = tv;
                    this.setFieldValue(data, value);
                }
                // 清理数据
                value = this.sanitize(value);
                if (value !== tv) {
                    this.setFieldValue(data, value);
                }
                if (this.checkField(value, result, prefix)) {
                    if (this.checkFun != null) {
                        const checkError = this.checkFun(value, data, prefix);
                        if (checkError != null) {
                            result.appendError(this.normalizeCheckError(checkError, prefix));
                        }
                    }
                }
            }
        }
    }

    /**
     * 规整 `check` 回调返回的错误。
     *
     * 回调是挂在某个具体字段上的，字段名校验器自己就知道，因此纯字符串一律补上
     * 本字段的标签。此前是直接丢给 ValidationResult.appendError，由它按冒号切分
     * 猜字段名——结果要么 field 为空串（前端无法把红框标到对应输入框上），要么把
     * 消息本身截断：'时间格式: HH:mm 不正确' 会被切成
     * { field: '时间格式', message: 'HH:mm 不正确' }。
     *
     * 回调若返回 ValidationError 对象则原样透传，字段名由回调自己决定。
     *
     * @param error - 回调的返回值
     * @param prefix - 嵌套校验的字段前缀
     * @protected
     */
    protected normalizeCheckError(error: any, prefix: string | null): ValidationError | string {
        if (typeof error === 'string') {
            return {field: this.getFieldLabel(prefix), message: error};
        }
        return error;
    }

    /**
     * 清理数据（子类可以重写）
     * @param value
     * @protected
     */
    protected sanitize(value: any): any {
        return value;
    }

    /**
     * 创建结构化错误对象
     * @param field
     * @param messageTemplate
     * @param params
     * @protected
     */
    protected createError(field: string, messageTemplate: string, params: Params = {}): ValidationError {
        const message = this.formatMessage(messageTemplate, {...params, field});
        return {
            field,
            message
        };
    }

    /**
     *
     * @param message
     * @param params
     * @protected
     */
    protected formatMessage(message: string,  params: Params): string {
        return message.replace(/\{\{([^}]+)\}\}/g, (match: any, paramName: any) => {
            const replacement = (params as Params)[(paramName as string).trim()];
            return replacement !== undefined ? String(replacement) : match;
        });
    }

    /**
     * 检查字段的值
     * @param value
     * @param result
     * @param prefix
     * @protected
     */
    protected checkField(_value: any, _result: ValidationResult, _prefix: string | null): boolean {
        return true;
    }

    /**
     * 检查字段的类型并转换成对应的值
     * @param value
     * @protected
     */
    protected checkType(value: any): any {
        return value;
    }

    /**
     * 获取错误类型
     * @protected
     */
    protected abstract getErrorType(): string;

    /**
     * 获取字段的名称
     * @param prefix
     * @protected
     */
    protected getFieldLabel(prefix: string | null): string {
        let label = this.name || this.field;
        if (prefix != null) {
            label = `${prefix}.${label}`;
        }
        return label;
    }

    /**
     * 从数据中提前字段值
     * @param data
     * @private
     */
    private extractFieldValue(data: any): any {
        const names = this.field.split(".");
        let result = data;
        names.forEach((attr) => {
            result = result == null ? result : result[attr];
        });
        return result;
    }

    /**
     * 设定字段值
     * @param data
     * @param value
     * @private
     */
    private setFieldValue(data: any, value: any) {
        if (data == null || typeof data !== 'object') {
            // 待校验的根对象本身不是对象（客户端提交了字面量 null、数组以外的基本
            // 类型，或干脆什么都没提交）。此前会直接在这里抛 TypeError，把整个
            // 请求打成未捕获异常，而不是优雅地返回一条校验错误。
            return;
        }
        const UNSAFE_KEYS = new Set(["__proto__", "prototype", "constructor"]);
        const names = this.field.split(".");
        if (names.some((key) => UNSAFE_KEYS.has(key))) {
            // 拒绝写入可能导致原型污染的字段路径
            return;
        }
        let current = data;
        for (let i = 0; i < names.length - 1; i++) {
            const key = names[i];
            const next = current[key];
            if (next == null) {
                current[key] = {}; // 中间层不存在，创建一个空对象
            } else if (typeof next !== 'object') {
                // 中间层已经是一个基本类型值。此前的写法用 !current[key] 判断，
                // 会把 0 / '' / false 这样的值直接替换成 {}，造成数据丢失。
                return;
            }
            current = current[key]; // 递归进入下一级
        }
        current[names[names.length - 1]] = value; // 设置最终的值
    }
}