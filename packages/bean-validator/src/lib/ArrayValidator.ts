import BaseValidator, {ValidatorOptions} from "./BaseValidator.js";
import ValidationResult from "./ValidationResult.js";
import {getMessage} from "./Locale.js";
import beanValidator from "./BeanValidator.js";


export interface ArrayValidatorOptions extends ValidatorOptions {
    rules?: Array<BaseValidator>;
    minLen?: number;
    maxLen?: number;
}

export default class ArrayValidator extends BaseValidator {

    protected rules?: Array<BaseValidator>;
    protected minLen?: number;
    protected maxLen?: number;

    constructor(field: string,  options: ArrayValidatorOptions) {
        super(field, options);
        this.rules = options?.rules;
        this.minLen = options?.minLen;
        this.maxLen = options?.maxLen;
    }

    protected checkField(arr: Array<any>, result: ValidationResult, prefix: string | null): boolean {
        let valid = true;
        const field = this.getFieldLabel(prefix);
        if (this.minLen != null && arr.length < this.minLen) {
            result.appendError(this.createError(field, getMessage().ARRAY_SHORTAGE, {min: this.minLen}));
            valid = false;
        } else if (this.maxLen != null && arr.length > this.maxLen) {
            result.appendError(this.createError(field, getMessage().ARRAY_EXCEED, {max: this.maxLen}));
            valid = false;
        }
        if (this.rules && arr.length > 0) {
            const rules = this.rules;
            arr.forEach((item, idx) => {
                const label = `${this.getFieldLabel(prefix)}`;
                const vr = beanValidator.validate(item, rules, `${label}[${idx}]`);
                result.combine(vr);
                valid = vr.valid && valid;
            });
        }
        return valid;
    }

    protected checkType(value: any): any {
        return Array.isArray(value) ? value : null;
    }

    protected getErrorType(): string {
        return getMessage().IS_NOT_ARRAY;
    }

}