import BaseValidator, {ValidatorOptions} from "./BaseValidator.js";
import ValidationResult from "./ValidationResult.js";
import {getMessage} from "./Locale.js";

export interface DateValidatorOptions extends ValidatorOptions {
    from?: Date,
    to?: Date,
    maxDaysBefore?: number,  //最早开始的天数
    maxDaysAfter?: number,  //最后开始的天数
}


export default class DateValidator extends BaseValidator {

    protected from?: Date;
    protected to?: Date;
    protected maxDaysBefore?: number;
    protected maxDaysAfter?: number;

    constructor(field: string,  options: DateValidatorOptions = {}) {
        super(field, options);
        this.from = options?.from;
        this.to = options?.to;
        this.maxDaysAfter = options?.maxDaysAfter;
        this.maxDaysBefore = options?.maxDaysBefore;
    }

    /**
     * 以「今天」为基准偏移若干个日历日，并取该日的起点或终点。
     *
     * 用 setDate 做日历日运算而非加减 86400000 毫秒：后者在夏令时切换的那一周
     * 会偏差一小时（新西兰、澳洲、欧美均有夏令时）。
     *
     * @param days - 相对今天的天数偏移，负数表示过去
     * @param edge - 取该日的 00:00:00.000 还是 23:59:59.999
     * @private
     */
    private static dayBoundary(days: number, edge: 'start' | 'end'): Date {
        const d = new Date();
        d.setDate(d.getDate() + days);
        if (edge === 'start') {
            d.setHours(0, 0, 0, 0);
        } else {
            d.setHours(23, 59, 59, 999);
        }
        return d;
    }

    protected checkField(value: any, result: ValidationResult, prefix: string | null): boolean {
        const field = this.getFieldLabel(prefix);
        // maxDaysBefore / maxDaysAfter 取整日边界。此前按毫秒计算且每次校验重新取
        // now，导致「恰好 N 天前」这个值的校验结果会随调用时刻在毫秒级上翻转；
        // 而错误信息给出的一直是天（toDateString），两者并不一致。
        // from / to 是调用方给的确切时刻，保持精确比较。
        const latestDate = this.maxDaysAfter != null
            ? DateValidator.dayBoundary(this.maxDaysAfter, 'end')
            : this.to;
        const earliestDate = this.maxDaysBefore != null
            ? DateValidator.dayBoundary(-this.maxDaysBefore, 'start')
            : this.from;
        if (earliestDate && earliestDate > value) {
            result.appendError(this.createError(field, getMessage().EARLIEST_DATE, {earliestDate: earliestDate.toDateString()}));
            return false;
        }
        if (latestDate && latestDate < value) {
            result.appendError(this.createError(field, getMessage().FINAL_DATE, {latestDate: latestDate.toDateString()}));
            return false;
        }
        return true;
    }

    protected checkType(value: any): any {
        if (typeof value == "string" || typeof value == "number") {
            value = new Date(value);
        }
        return (value instanceof Date && !isNaN(value.getTime())) ? value : null;
    }

    protected getErrorType(): string {
        return getMessage().INVALID_DATE;
    }

}