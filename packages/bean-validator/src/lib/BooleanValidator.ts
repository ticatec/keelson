import BaseValidator, {ValidatorOptions} from "./BaseValidator.js";
import {getMessage} from "./Locale.js";

export default class BooleanValidator extends BaseValidator {

    constructor(field: string, options: ValidatorOptions) {
        super(field, options);
    }

    /**
     * 接受布尔值本身、数字 0 / 1，以及字符串 'true' / 'false' / '1' / '0'
     * （不区分大小写，两端空白会被忽略）。其余一律视为类型错误。
     * @param value
     * @protected
     */
    protected checkType(value: any): any {
        if (typeof value == "number") {
            // 只接受 0 与 1，与字符串分支以及文档声明的格式保持一致。此前用
            // value != 0 判断，42、-1、2.5、Infinity 全都成了 true，而字符串
            // '42' 却报类型错误——同一个值换种写法结论相反。
            if (value === 0) return false;
            if (value === 1) return true;
            return null;
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