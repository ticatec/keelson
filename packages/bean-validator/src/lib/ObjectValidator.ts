import BaseValidator, {ValidatorOptions} from "./BaseValidator.js";
import ValidationResult from "./ValidationResult.js";
import {getMessage} from "./Locale.js";
import beanValidator from "./BeanValidator.js";


export interface ObjectValidatorOptions extends ValidatorOptions {
    rules: Array<BaseValidator>;
}


export default class ObjectValidator extends BaseValidator {

    protected rules: Array<BaseValidator>;

    constructor(field: string,  options: ObjectValidatorOptions) {
        super(field, options);
        this.rules = options?.rules;
    }

    protected checkType(value: any): any {
        return (typeof value === 'object' && value !== null && !Array.isArray(value)) ? value : null;
    }

    protected checkField(value: any, result: ValidationResult, prefix: string): boolean {
        const r1 = beanValidator.validate(value, this.rules, this.getFieldLabel(prefix));
        result.combine(r1);
        return r1.valid;
    }

    protected getErrorType(): string {
        return getMessage().IS_NOT_OBJECT;
    }

}