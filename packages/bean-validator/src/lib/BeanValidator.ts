import BaseValidator from "./BaseValidator.js";
import ValidationResult from "./ValidationResult.js";
import {getLogger} from "@ticatec/logger-api";

/**
 * `getLogger` 返回的是一个惰性解析的代理，因此放在模块作用域是安全的：
 * 真正的 logger 在第一次调用时才解析，与 setLoggerProvider() 的调用顺序无关。
 */
const logger = getLogger('BeanValidator');

/**
 * 按给定规则校验数据。
 *
 * 校验结束后，若存在错误会记一条 `debug` 级日志。用 debug 而不是 warn/error：
 * 校验失败是处理不可信输入时的预期结果，是调用方的问题而非服务端故障，在真实
 * 流量下按 warn 记录会把真正要紧的日志淹掉。排查时把 LOG_LEVEL 调到 debug 即可
 * 看到。这与 @ticatec/node-exception 对 4xx 的处理是一致的。
 *
 * 只有顶层调用才记录：ObjectValidator / ArrayValidator 会带着 prefix 递归调用
 * 本函数，若每层都记，一次校验会产生多条彼此重叠的残缺记录。
 *
 * 日志内容只有字段名与消息模板渲染出的文本，不含字段值本身——除非应用自己在
 * `check` 回调里把值拼进了错误消息。
 *
 * @param data - 待校验的对象。校验过程会就地写回类型转换与清理后的值。
 * @param rules - 校验规则
 * @param prefix - 内部使用：嵌套校验时的字段前缀
 */
const validate = (data: any, rules: Array<BaseValidator>, prefix: string | null = null): ValidationResult => {
    const result = new ValidationResult();
    for (const rule of rules) {
        rule.validate(data, result, prefix);
    }
    if (prefix == null && !result.valid) {
        try {
            const errors = result.errors;
            logger.debug({errors}, `Validation failed with ${errors.length} error(s)`);
        } catch {
            // 日志失败不能影响校验结果
        }
    }
    return result;
}

export default {
    validate
}
