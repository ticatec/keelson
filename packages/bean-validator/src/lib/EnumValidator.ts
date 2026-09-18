import BaseValidator, {ValidatorOptions} from "./BaseValidator.js";
import {getMessage} from "./Locale.js";

export interface EnumValidatorOptions extends ValidatorOptions {
    values: Array<any>;
}


export default class EnumValidator extends BaseValidator {

    protected values: Array<any>;

    constructor(field: string,  options: EnumValidatorOptions) {
        super(field, options);
        this.values = options?.values;
    }

    protected checkType(value: any): any {
        if (!Array.isArray(this.values)) {
            return null;
        }
        return this.values.includes(value) ? value : null;
    }

    protected getErrorType(): string {
        return getMessage().INVALID_ENUM;
    }

}