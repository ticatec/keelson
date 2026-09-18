import BaseValidator from "./BaseValidator.js";
import ValidationResult from "./ValidationResult.js";

const validate = (data: any, rules: Array<BaseValidator>, prefix: string | null = null): ValidationResult => {
    const result = new ValidationResult();
    for (const rule of rules) {
        rule.validate(data, result, prefix);
    }
    return result;
}

export default {
    validate
}