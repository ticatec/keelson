/**
 * Message templates used to build validation errors.
 *
 * Placeholders are written as `{{name}}` and are filled from the parameters the
 * validator passes in, plus `field` (the label of the field being validated).
 */
export interface LocaleMessages {
    REQUIRED: string;
    INVALID_BOOLEAN: string;
    INVALID_STRING: string;
    INVALID_NUMBER: string;
    INVALID_DATE: string;
    INVALID_ENUM: string;
    STRING_LENGTH_EXCEED: string;
    STRING_LENGTH_SHORTAGE: string;
    EARLIEST_DATE: string;
    FINAL_DATE: string;
    NUMBER_EXCEED: string;
    NUMBER_SHORTAGE: string;
    ARRAY_EXCEED: string;
    ARRAY_SHORTAGE: string;
    INVALID_ARRAY: string;
    IS_NOT_ARRAY: string;
    IS_NOT_OBJECT: string;
    INVALID_OBJECT: string;
    INVALID_ARRAY_ITEM: string;
}

const DEFAULT_MESSAGES: LocaleMessages = {
    REQUIRED: `cannot be empty`,
    INVALID_BOOLEAN: 'is not a valid boolean value',
    INVALID_STRING: `is not a valid string`,
    INVALID_NUMBER: `is not a valid number`,
    INVALID_DATE: `is not a valid date`,
    INVALID_ENUM: `is not a valid value`,
    STRING_LENGTH_EXCEED: `length exceeds {{maxLength}} characters`,
    STRING_LENGTH_SHORTAGE: `length must be at least {{minLength}} characters`,
    EARLIEST_DATE: "date cannot be earlier than {{earliestDate}}",
    FINAL_DATE: "final date cannot exceed {{latestDate}}",
    NUMBER_EXCEED: `exceeds the maximum value {{max}}`,
    NUMBER_SHORTAGE: `cannot be less than the minimum value {{min}}`,
    ARRAY_EXCEED: `array exceeds {{max}} records`,
    ARRAY_SHORTAGE: `array must contain at least {{min}} records`,
    INVALID_ARRAY: 'is not a valid array [{{error}}]',
    IS_NOT_ARRAY: 'is not an array',
    IS_NOT_OBJECT: 'is not an object',
    INVALID_OBJECT: 'contains an error [{{error}}]',
    INVALID_ARRAY_ITEM: 'Row [{{rowIdx}}] in the array contains an error [{{error}}]'
};

interface LocaleState {
    message: LocaleMessages;
}

/**
 * The active message set is held on `globalThis` under a well-known symbol.
 *
 * This package ships a CommonJS build and an ESM build; Node treats them as two
 * separate module instances, so a module-scoped variable would give an application
 * that mixes `require()` and `import` two independent message sets - one localised
 * and one still in English. Anchoring the state to the global registry keeps a
 * single message set per process however the package is loaded.
 */
const STATE_KEY = Symbol.for('@ticatec/bean-validator.locale');

const state: LocaleState = ((globalThis as any)[STATE_KEY] ??= {
    message: {...DEFAULT_MESSAGES}
});

/**
 * Overrides message templates. Keys that are left out keep their current value,
 * so a partial translation is fine:
 *
 * ```typescript
 * setLocaleMessage({ REQUIRED: '不能为空', INVALID_NUMBER: '不是有效的数字' });
 * ```
 *
 * @param message - The templates to override.
 */
const setLocaleMessage = (message: Partial<LocaleMessages>): void => {
    state.message = {...state.message, ...message};
};

/**
 * Restores every message template to its built-in English default.
 */
const resetLocaleMessage = (): void => {
    state.message = {...DEFAULT_MESSAGES};
};

/**
 * Returns the message templates currently in effect.
 */
const getMessage = (): LocaleMessages => state.message;

export {setLocaleMessage, resetLocaleMessage, getMessage, DEFAULT_MESSAGES};
