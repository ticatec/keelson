export interface ValidationError {
    field: string;
    message: string;
}

export default class ValidationResult {

    private errorList: Array<ValidationError>;

    constructor() {
        this.errorList = [];
    }

    appendError(error: string | ValidationError): void {
        if (typeof error === 'string') {
            // 兼容旧的字符串格式，尝试解析字段名
            const colonIndex = error.indexOf(':');
            if (colonIndex > 0) {
                this.errorList.push({
                    field: error.substring(0, colonIndex).trim(),
                    message: error.substring(colonIndex + 1).trim()
                });
            } else {
                this.errorList.push({
                    field: '',
                    message: error
                });
            }
        } else {
            this.errorList.push(error);
        }
    }

    combine(result: ValidationResult): void {
        this.errorList.push(...result.errorList);
    }

    get valid(): boolean {
        return this.errorList.length == 0;
    }

    get errorMessage(): string {
        return this.errorList.map(e => e.field ? `${e.field}: ${e.message}` : e.message).join('\n');
    }

    /**
     * 返回错误列表的副本。此前直接返回内部数组，调用方 push 进去的内容会成为
     * 校验结果的一部分。
     */
    get errors(): Array<ValidationError> {
        return [...this.errorList];
    }
}