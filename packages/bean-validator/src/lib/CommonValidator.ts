import BaseValidator, {ValidatorOptions} from "./BaseValidator.js";

export default class CommonValidator extends BaseValidator {

    constructor(field: string,  options: ValidatorOptions = {}) {
        super(field, options);
    }

    protected getErrorType(): string {
        return '';
    }

}