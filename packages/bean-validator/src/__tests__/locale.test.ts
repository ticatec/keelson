import beanValidator, {
    NumberValidator,
    StringValidator,
    setLocaleMessage,
    resetLocaleMessage,
    getMessage,
    DEFAULT_MESSAGES
} from '../index';

describe('locale', () => {
    afterEach(() => resetLocaleMessage());

    it('is reachable from the package entry point', () => {
        // Locale.ts has always exported these, but index.ts did not re-export
        // them - the localisation feature was unreachable for consumers.
        expect(typeof setLocaleMessage).toBe('function');
        expect(typeof getMessage).toBe('function');
        expect(typeof resetLocaleMessage).toBe('function');
    });

    it('accepts a partial override and keeps the rest', () => {
        setLocaleMessage({REQUIRED: '不能为空'});

        const res = beanValidator.validate({v: null}, [new StringValidator('v', {required: true})]);
        expect(res.errors[0].message).toBe('不能为空');

        // untouched key still English
        expect(getMessage().INVALID_NUMBER).toBe(DEFAULT_MESSAGES.INVALID_NUMBER);
    });

    it('keeps placeholders working in a translation', () => {
        setLocaleMessage({STRING_LENGTH_SHORTAGE: '长度不能少于 {{minLength}} 个字符'});
        const res = beanValidator.validate({v: 'ab'}, [new StringValidator('v', {minLen: 5})]);
        expect(res.errors[0].message).toBe('长度不能少于 5 个字符');
    });

    it('resets back to the built-in defaults', () => {
        setLocaleMessage({INVALID_NUMBER: '不是数字'});
        expect(beanValidator.validate({v: 'x'}, [new NumberValidator('v', {})]).errors[0].message).toBe('不是数字');

        resetLocaleMessage();
        expect(beanValidator.validate({v: 'x'}, [new NumberValidator('v', {})]).errors[0].message)
            .toBe(DEFAULT_MESSAGES.INVALID_NUMBER);
    });

    it('does not let a translation mutate the defaults', () => {
        setLocaleMessage({REQUIRED: 'changed'});
        expect(DEFAULT_MESSAGES.REQUIRED).toBe('cannot be empty');
    });
});
