import beanValidator from "./lib/BeanValidator.js";
import ObjectValidator from "./lib/ObjectValidator.js";
import StringValidator from "./lib/StringValidator.js";
import EnumValidator from "./lib/EnumValidator.js";
import NumberValidator from "./lib/NumberValidator.js";
import DateValidator from "./lib/DateValidator.js";
import ArrayValidator from "./lib/ArrayValidator.js";
import BooleanValidator from "./lib/BooleanValidator.js";
import BaseValidator from "./lib/BaseValidator.js";
import ValidationResult, {ValidationError} from "./lib/ValidationResult.js";

export type ValidationRules = Array<BaseValidator>;

export {ObjectValidator, StringValidator, EnumValidator, NumberValidator, DateValidator, ArrayValidator, BooleanValidator, BaseValidator, ValidationResult, ValidationError}

export default beanValidator;