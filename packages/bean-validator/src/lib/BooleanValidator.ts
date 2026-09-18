import BaseValidator, {ValidatorOptions} from "./BaseValidator.js";
import {getMessage} from "./Locale.js";

export default class BooleanValidator extends BaseValidator {

    constructor(field: string, options: ValidatorOptions) {
        super(field, options);
    }

    /**
     * 接受 0/1 or true/false or 布尔值
     * @param value
     * @protected
     */
    protected checkType(value: any): any {
        if (typeof value == "number") {
            return isNaN(value) ? null : value != 0;
        } else if (typeof value == 'string') {
            const v = value.toLowerCase().trim();
            if (v == 'true' || v == '1') return true;
            if (v == 'false' || v == '0') return false;
            return null;
        } else if (typeof value == 'boolean') {
            return value;
        }
        return null;
    }

    protected getErrorType(): string {
        return getMessage().INVALID_BOOLEAN;
    }

}