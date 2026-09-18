import beanValidator from "./lib/BeanValidator.js";
import ObjectValidator from "./lib/ObjectValidator.js";
import StringValidator from "./lib/StringValidator.js";
import EnumValidator from "./lib/EnumValidator.js";
import NumberValidator from "./lib/NumberValidator.js";
import DateValidator from "./lib/DateValidator.js";
import ArrayValidator from "./lib/ArrayValidator.js";
import BooleanValidator from "./lib/BooleanValidator.js";
import CommonValidator from "./lib/CommonValidator.js";
import BaseValidator from "./lib/BaseValidator.js";
import ValidationResult from "./lib/ValidationResult.js";
import {setLocaleMessage, resetLocaleMessage, getMessage, DEFAULT_MESSAGES} from "./lib/Locale.js";

import type {ValidationError} from "./lib/ValidationResult.js";
import type {ValidatorOptions, CustomCheck, IgnoreCheck} from "./lib/BaseValidator.js";
import type {StringValidatorOptions} from "./lib/StringValidator.js";
import type {NumberValidatorOptions} from "./lib/NumberValidator.js";
import type {DateValidatorOptions} from "./lib/DateValidator.js";
import type {EnumValidatorOptions} from "./lib/EnumValidator.js";
import type {ArrayValidatorOptions} from "./lib/ArrayValidator.js";
import type {ObjectValidatorOptions} from "./lib/ObjectValidator.js";
import type {LocaleMessages} from "./lib/Locale.js";

export type ValidationRules = Array<BaseValidator>;

export {
    ObjectValidator,
    StringValidator,
    EnumValidator,
    NumberValidator,
    DateValidator,
    ArrayValidator,
    BooleanValidator,
    CommonValidator,
    BaseValidator,
    ValidationResult,
    /** Overrides message templates; keys left out keep their current value */
    setLocaleMessage,
    /** Restores every message template to its built-in English default */
    resetLocaleMessage,
    /** The message templates currently in effect */
    getMessage,
    /** The built-in English templates, useful as a base for a translation */
    DEFAULT_MESSAGES
};

/**
 * Interfaces are exported as types so the package stays safe under
 * `isolatedModules` / transpile-only toolchains (esbuild, swc, ts-jest).
 */
export type {
    ValidationError,
    ValidatorOptions,
    CustomCheck,
    IgnoreCheck,
    StringValidatorOptions,
    NumberValidatorOptions,
    DateValidatorOptions,
    EnumValidatorOptions,
    ArrayValidatorOptions,
    ObjectValidatorOptions,
    LocaleMessages
};

export default beanValidator;
