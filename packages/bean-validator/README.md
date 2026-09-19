# Bean Validator

[![Version](https://img.shields.io/npm/v/@ticatec/bean-validator)](https://www.npmjs.com/package/@ticatec/bean-validator)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

A flexible and powerful validation library for Node.js that allows you to validate JavaScript objects through rule-based validation with data sanitization.

[中文文档](README_CN.md) | English

## Features

- ✅ **Dual Module Support**: Full support for both ES Modules (ESM) and CommonJS (CJS)
- ✅ **Type-safe**: Built with TypeScript for full type safety
- ✅ **Data Sanitization**: Automatic data cleaning and normalization (trimming, case conversion, rounding)
- ✅ **Default Values**: Set default values for missing or empty fields
- ✅ **Type Conversion**: Automatic type conversion (string to number, date parsing, etc.)
- ✅ **Nested Validation**: Support for nested objects and arrays
- ✅ **Custom Validation**: Flexible custom validation functions
- ✅ **Structured Errors**: Detailed error objects for better error handling
- ✅ **Field Aliases**: Use friendly field names in error messages
- ✅ **Localisation**: Override any message template, partially or completely
- ✅ **Empty Means Empty**: A blank form field reports "cannot be empty", not a type error
- ✅ **Built-in Logging**: Failures are logged through the `@ticatec/logger-api` contract

## Installation

```shell
npm i @ticatec/bean-validator @ticatec/logger-api
```

`@ticatec/logger-api` is a peer dependency - the zero-dependency logging contract
this package writes its records against. See [Logging](#logging).

## Import Usage

**ES Modules (ESM):**
```typescript
import beanValidator, { StringValidator, NumberValidator, EnumValidator } from "@ticatec/bean-validator";
```

**CommonJS (CJS):**
```javascript
const beanValidator = require("@ticatec/bean-validator").default;
const { StringValidator, NumberValidator, EnumValidator } = require("@ticatec/bean-validator");
```

## Quick Start

```typescript
import beanValidator, { StringValidator, NumberValidator, EnumValidator } from "@ticatec/bean-validator";

// Define validation rules
const rules = [
    new StringValidator('email', {
        name: 'Email Address',
        required: true,
        toLowerCase: true,
        maxLen: 100
    }),
    new NumberValidator('age', {
        required: true,
        minValue: 0,
        maxValue: 120
    }),
    new EnumValidator('status', {
        defaultValue: 'active',
        values: ['active', 'inactive', 'pending']
    })
];

// Data to validate
const data = {
    email: 'JOHN@EXAMPLE.COM',
    age: 30
};

// Perform validation
const result = beanValidator.validate(data, rules);

if (result.valid) {
    console.log('Validation passed!');
    console.log('Sanitized data:', data);
    // Output: { email: 'john@example.com', age: 30, status: 'active' }
} else {
    console.log('Validation errors:', result.errors);
}
```

## Validators

### StringValidator

Validates and sanitizes string values with support for length constraints, format validation, case conversion, and configurable whitespace trimming.

#### Options

```typescript
interface StringValidatorOptions extends ValidatorOptions {
    minLen?: number;           // Minimum length
    maxLen?: number;           // Maximum length
    format?: {
        regex: RegExp;         // Regular expression for format validation
        message: string;       // Error message when format validation fails
    };
    toLowerCase?: boolean;     // Convert to lowercase
    toUpperCase?: boolean;     // Convert to uppercase
    trim?: boolean;            // Auto-trim whitespace (default: true)
}
```

#### Examples

**Basic validation:**
```typescript
new StringValidator('email', {
    required: true,
    maxLen: 100,
    format: {
        regex: /^[^\s@]+@[^\s@]+\.[^\s@]+$/,
        message: 'Invalid email format'
    }
});
```

**Auto-sanitization:**
```typescript
new StringValidator('email', {
    toLowerCase: true  // Automatically converts to lowercase
});

new StringValidator('username', {
    toUpperCase: true  // Automatically converts to uppercase
});
```

### NumberValidator

Validates and sanitizes numeric values with range constraints, automatic type conversion, and rounding.

#### Options

```typescript
interface NumberValidatorOptions extends ValidatorOptions {
    minValue?: number;        // Minimum value
    maxValue?: number;        // Maximum value
    round?: number;           // Number of decimal places to keep
    roundMode?: 'ceil' | 'floor' | 'round';  // Rounding mode
}
```

#### Examples

**Basic validation:**
```typescript
new NumberValidator('age', {
    required: true,
    minValue: 0,
    maxValue: 120
});
```

**Rounding:**
```typescript
new NumberValidator('price', {
    round: 2,              // Keep 2 decimal places
    roundMode: 'round'     // Options: 'round', 'ceil', 'floor'
});

// Input: 99.876 → Output: 99.88
```

**Auto-type conversion:**
```typescript
new NumberValidator('count', {
    defaultValue: 1
});

// Input: { count: "5" } → Output: { count: 5 }
```

**Which strings are accepted**

A string must be a decimal literal: an optional sign, digits, an optional decimal
point and an optional exponent. The converted value is written back into the bean.

| Accepted | Rejected |
|---|---|
| `'12'`, `'  12  '`, `'-3.5'`, `'+7'`, `'.5'` | `'12abc'`, `'1,000'`, `'1 2'` |
| `'1e3'` → `1000`, `'1E-2'` → `0.01` | `'0x1f'`, `'0b101'`, `'0o17'` |
| | `'Infinity'`, `'-Infinity'`, `'NaN'` |

Hexadecimal and binary literals are rejected deliberately: `Number('0x1f')` is 31,
which is never what a numeric form field or JSON payload meant. Non-finite values
are rejected whether they arrive as a string or as a number - an `Infinity` written
back into the bean serialises to `null` and breaks a database insert.

### DateValidator

Validates date values with support for date ranges and relative date constraints.

#### Options

```typescript
interface DateValidatorOptions extends ValidatorOptions {
    from?: Date;              // Earliest allowed date
    to?: Date;                // Latest allowed date
    maxDaysBefore?: number;   // Maximum days before today
    maxDaysAfter?: number;    // Maximum days after today
}
```

`maxDaysBefore` / `maxDaysAfter` are **whole-day** boundaries, matching the whole
day quoted in the error message:

- `maxDaysBefore: 10` - the earliest acceptable instant is `00:00:00.000` of the
  day 10 days ago, so any time on that day passes.
- `maxDaysAfter: 10` - the latest acceptable instant is `23:59:59.999` of the day
  10 days ahead.

Day arithmetic goes through the calendar, not by adding 86 400 000 ms, so the
boundary stays correct across a daylight-saving transition.

`from` and `to` are exact instants and are compared exactly - use those when you
need finer granularity than a day.

#### Example

```typescript
new DateValidator('birthDate', {
    required: true,
    maxDaysBefore: 36500  // Allow dates up to 100 years ago
});

new DateValidator('startsAt', {
    from: new Date('2026-06-15T12:00:00Z')  // exact instant, not the whole day
});
```

### EnumValidator

Validates that a value exists within a predefined set of allowed values.

#### Options

```typescript
interface EnumValidatorOptions extends ValidatorOptions {
    values: Array<any>;  // Array of allowed values
}
```

#### Example

```typescript
new EnumValidator('status', {
    defaultValue: 'active',
    values: ['active', 'inactive', 'pending']
});
```

### BooleanValidator

Validates boolean values with automatic type conversion.

#### Example

```typescript
new BooleanValidator('isActive', {
    defaultValue: false
});

// Accepts: true, false, 0, 1, "true", "false", "1", "0"
//           (strings are trimmed and case-insensitive)
// Rejects everything else, including other numbers: 42 and "42" are both
// a type error, rather than 42 quietly becoming true.
```

### ObjectValidator

Validates nested objects by applying validation rules to the object's properties.

#### Options

```typescript
interface ObjectValidatorOptions extends ValidatorOptions {
    rules: Array<BaseValidator>;  // Validation rules for the nested object
}
```

#### Example

```typescript
const addressRules = [
    new StringValidator('street', {required: true, maxLen: 100}),
    new StringValidator('city', {required: true, maxLen: 50}),
    new StringValidator('zipCode', {required: true, maxLen: 10})
];

new ObjectValidator('address', {
    required: true,
    rules: addressRules
});
```

### ArrayValidator

Validates arrays with support for length constraints and element validation.

#### Options

```typescript
interface ArrayValidatorOptions extends ValidatorOptions {
    rules?: Array<BaseValidator>;  // Validation rules for array elements
    minLen?: number;               // Minimum array length
    maxLen?: number;               // Maximum array length
}
```

#### Example

```typescript
const itemRules = [
    new StringValidator('name', {required: true}),
    new NumberValidator('quantity', {required: true, minValue: 1})
];

new ArrayValidator('items', {
    required: true,
    minLen: 1,
    maxLen: 10,
    rules: itemRules
});
```

## Common Options

All validators extend from `BaseValidator` and support these common options:

```typescript
interface ValidatorOptions {
    required?: boolean;      // Whether the field is required
    name?: string;          // Friendly field name for error messages
    defaultValue?: any;     // Default value when field is null/undefined/empty
    check?: CustomCheck;     // Custom validation function
    ignoreWhen?: IgnoreCheck; // Conditional validation skip
}

type CustomCheck = (value: any, data: any, prefix: string | null) => any;
type IgnoreCheck = (value: any, data: any) => boolean;
```

### Empty Values

An untouched input in an HTML form posts an empty string, not `null`. All
validators treat that as "not filled in":

| Field state | `required: true` | `required: false` |
|---|---|---|
| key missing, `null`, `undefined` | `cannot be empty` | skipped |
| `''` | `cannot be empty` | skipped |
| `'   '` (whitespace only) | `cannot be empty` | skipped |

A field left blank is not checked against `minLen`, `maxLen` or `format`
either - leaving an optional field empty and omitting it entirely behave the
same way.

```typescript
const rules = [new NumberValidator('age', { required: true })];

beanValidator.validate({ age: '' }, rules).errorMessage;
// "age: cannot be empty"   - not "age: is not a valid number"

beanValidator.validate({ age: '' }, [new NumberValidator('age', {})]).valid;
// true - an optional field left blank is simply absent
```

For `StringValidator`, leaving an optional field blank (`''`, or whitespace with
the default `trim: true`) skips `minLen`, `maxLen`, and `format` as well. If the
field is required, a blank string reports `cannot be empty`. With `trim: false`,
whitespace is preserved and treated as a non-empty value that counts toward the
length.

```typescript
// An optional field left blank is not held to minLen or format
beanValidator.validate({ note: '' }, [new StringValidator('note', { minLen: 3 })]).valid;      // true
beanValidator.validate({ note: 'ab' }, [new StringValidator('note', { minLen: 3 })]).valid;    // false

// With trim: false, whitespace is preserved and counts toward the length
beanValidator.validate({ note: '   ' }, [new StringValidator('note', { minLen: 3, trim: false })]).valid;  // true
```

A `defaultValue` takes precedence over all of this: an empty value is replaced by
the default and then validated normally.

### Field Alias

Use the `name` option to display friendly field names in error messages:

```typescript
new StringValidator('usr_email', {
    name: 'Email Address',
    required: true
});

// Error message: "Email Address: cannot be empty"
```

### Default Values

Set default values for missing or empty fields:

```typescript
new StringValidator('status', {
    defaultValue: 'active'
});

new NumberValidator('quantity', {
    defaultValue: 1,
    round: 0  // Also rounds to integer
});
```

### Custom Validation

Add custom validation logic using the `check` option:

```typescript
new StringValidator('username', {
    required: true,
    minLen: 3,
    maxLen: 20,
    check: (value, data, prefix) => {
        if (value.includes(' ')) {
            return 'Username cannot contain spaces';
        }
        return null; // null means validation passed
    }
});
```

A plain string is reported against the field the check is attached to, so
`error.field` is usable for highlighting the right input:

```typescript
beanValidator.validate({ username: 'a b' }, rules).errors;
// [ { field: 'username', message: 'Username cannot contain spaces' } ]
```

Return a `ValidationError` object instead when the problem belongs to a
different field - a cross-field rule, say:

```typescript
check: (value, data) => (value < data.startDate
    ? { field: 'endDate', message: 'must be after the start date' }
    : null)
```

### Conditional Validation

Skip validation based on conditions using `ignoreWhen`:

```typescript
new StringValidator('phone', {
    required: true,
    ignoreWhen: (value, data) => {
        // Skip phone validation if email is provided
        return !!data.email;
    }
});
```

## Validation Results

The validation result provides both simple and structured error information:

```typescript
interface ValidationResult {
    valid: boolean;              // Whether validation passed
    errorMessage: string;        // All errors as a string (backward compatible)
    errors: ValidationError[];   // Structured error array
}

interface ValidationError {
    field: string;              // Field name (or alias)
    message: string;            // Error message
}
```

### Usage Examples

**Simple error message:**
```typescript
if (!result.valid) {
    console.log(result.errorMessage);
    // Output:
    // Email Address: cannot be empty
    // Age: cannot be less than the minimum value 0
}
```

`errors` returns a copy of the list, so mutating the returned array does not
change the result.

**Structured errors:**
```typescript
if (!result.valid) {
    result.errors.forEach(error => {
        console.log(`${error.field}: ${error.message}`);
    });
}

// Or use in API responses:
res.status(400).json({
    errors: result.errors
});
```

**Response format:**
```json
{
  "errors": [
    {
      "field": "Email Address",
      "message": "cannot be empty"
    },
    {
      "field": "Age",
      "message": "cannot be less than the minimum value 0"
    }
  ]
}
```

## Advanced Features

### Nested Field Access

Use dot notation to access and validate nested properties:

```typescript
new StringValidator('user.profile.email', {
    name: 'Email',
    required: true,
    toLowerCase: true
});
```

### Data Sanitization

The library automatically sanitizes data during validation:

**String sanitization:**
```typescript
// Trims whitespace and converts case
new StringValidator('email', {
    toLowerCase: true
});
// Input: "  JOHN@EXAMPLE.COM  " → Output: "john@example.com"
```

**Number sanitization:**
```typescript
// Converts type and rounds
new NumberValidator('price', {
    round: 2
});
// Input: "99.876" → Output: 99.88
```

**Combined sanitization:**
```typescript
const rules = [
    new StringValidator('email', {
        toLowerCase: true
    }),
    new StringValidator('status', {
        defaultValue: 'active',
        toUpperCase: true
    }),
    new NumberValidator('price', {
        round: 2
    }),
    new NumberValidator('quantity', {
        defaultValue: 1,
        round: 0
    })
];

const data = {
    email: '  USER@EXAMPLE.COM  ',
    price: '99.876'
};

// Result:
// {
//   email: 'user@example.com',
//   status: 'ACTIVE',
//   price: 99.88,
//   quantity: 1
// }
```

## Localisation

Every message is a template. `setLocaleMessage` overrides the templates you pass
and leaves the rest alone, so a partial translation is fine:

```typescript
import { setLocaleMessage, resetLocaleMessage, getMessage, DEFAULT_MESSAGES } from "@ticatec/bean-validator";

setLocaleMessage({
    REQUIRED: '不能为空',
    INVALID_NUMBER: '不是有效的数字',
    STRING_LENGTH_SHORTAGE: '长度不能少于 {{minLength}} 个字符'
});

// "email: 不能为空"
```

Placeholders are written as `{{name}}` and are filled from the values the
validator supplies. The full set of keys is the `LocaleMessages` interface;
`DEFAULT_MESSAGES` holds the built-in English templates and is a convenient base
for a translation. `resetLocaleMessage()` restores them, and `getMessage()`
returns the templates currently in effect.

| Key | Default | Placeholders |
|---|---|---|
| `REQUIRED` | cannot be empty | |
| `INVALID_STRING` | is not a valid string | |
| `INVALID_NUMBER` | is not a valid number | |
| `INVALID_DATE` | is not a valid date | |
| `INVALID_BOOLEAN` | is not a valid boolean value | |
| `INVALID_ENUM` | is not a valid value | |
| `STRING_LENGTH_SHORTAGE` | length must be at least {{minLength}} characters | `minLength` |
| `STRING_LENGTH_EXCEED` | length exceeds {{maxLength}} characters | `maxLength` |
| `NUMBER_SHORTAGE` | cannot be less than the minimum value {{min}} | `min` |
| `NUMBER_EXCEED` | exceeds the maximum value {{max}} | `max` |
| `EARLIEST_DATE` | date cannot be earlier than {{earliestDate}} | `earliestDate` |
| `FINAL_DATE` | final date cannot exceed {{latestDate}} | `latestDate` |
| `ARRAY_SHORTAGE` | array must contain at least {{min}} records | `min` |
| `ARRAY_EXCEED` | array exceeds {{max}} records | `max` |
| `IS_NOT_ARRAY` | is not an array | |
| `IS_NOT_OBJECT` | is not an object | |

Call it once at startup. The message set is shared by the package's CommonJS and
ESM builds, so it applies however the package was loaded.

## Logging

When a validation produces errors, one record is written through
[`@ticatec/logger-api`](https://www.npmjs.com/package/@ticatec/logger-api):

```
2026-09-18T03:36:39.945Z DEBUG [BeanValidator] Validation failed with 3 error(s) {"errors":[{"field":"Email Address","message":"cannot be empty"},{"field":"age","message":"is not a valid number"},{"field":"user.name","message":"cannot be empty"}]}
```

A few things worth knowing:

- **The level is `debug`.** A validation failure is the expected outcome of
  handling untrusted input - the caller's problem, not a server fault - so at any
  real traffic volume logging it higher would drown out the records that matter.
  It is the same treatment `@ticatec/node-exception` gives a 4xx. Set
  `LOG_LEVEL=debug` when you want to see it.
- **One record per validation**, not one per rule or per nesting level.
  `ObjectValidator` and `ArrayValidator` re-enter the validator internally; only
  the outermost call logs.
- **Field values are not logged** - only field names and the rendered message.
  The exception is a message your own `check` callback builds, which is yours to
  control.
- **A failing logger cannot break validation**: the failure is swallowed and the
  result is returned as normal.

With no provider registered, `@ticatec/logger-api` falls back to the console,
filtered by `LOG_LEVEL`. To send the records to a real logger, register a provider
once at startup:

```typescript
import { setLoggerProvider } from '@ticatec/logger-api';
import { initialize, getPinoLogger } from '@ticatec/logger-pino';

initialize({
    appenders: [{ name: 'out', type: 'console', level: 'debug' }],
    loggers: { root: { level: 'debug', appenders: ['out'] } }
});
setLoggerProvider(getPinoLogger);
```

## Complete Example

```typescript
import beanValidator from "@ticatec/bean-validator";
import {StringValidator, NumberValidator, DateValidator, EnumValidator, ObjectValidator, ArrayValidator} from "@ticatec/bean-validator";

// Define nested validation rules
const memberRules = [
    new DateValidator('registerOn', {maxDaysAfter: -5}),
    new StringValidator('password', {
        required: true,
        format: {
            regex: /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)[A-Za-z\d]{8,}$/,
            message: 'Password must be at least 8 characters with uppercase, lowercase and numbers'
        }
    })
];

// Define main validation rules
const rules = [
    new StringValidator('name', {
        name: 'Full Name',
        required: true,
        maxLen: 50
    }),
    new NumberValidator('age', {
        required: true,
        minValue: 15,
        maxValue: 90
    }),
    new DateValidator('dob', {
        name: 'Date of Birth',
        maxDaysBefore: 100000
    }),
    new EnumValidator('gender', {
        values: ['F', 'M']
    }),
    new StringValidator('email', {
        toLowerCase: true,
        format: {
            regex: /^[^\s@]+@[^\s@]+\.[^\s@]+$/,
            message: 'Invalid email format'
        }
    }),
    new StringValidator('status', {
        defaultValue: 'active',
        toUpperCase: true
    }),
    new ObjectValidator('member', {
        rules: memberRules
    })
];

// Rules for parent with children
const parentRules = [
    ...rules,
    new ArrayValidator('children', {
        required: true,
        rules: rules
    })
];

const data = {
    name: 'John Doe',
    age: 35,
    dob: '1988-03-05',
    gender: 'M',
    email: 'JOHN@EXAMPLE.COM',
    member: {
        registerOn: new Date('2023-01-01'),
        password: 'SecurePass123'
    },
    children: [
        {
            name: 'Jane',
            age: 16,
            dob: '2007-08-12',
            gender: 'F',
            email: 'jane@example.com',
            member: {
                registerOn: new Date('2023-06-01'),
                password: 'ChildPass456'
            }
        }
    ]
};

const result = beanValidator.validate(data, parentRules);

if (result.valid) {
    console.log('All validations passed!');
    console.log('Validated and sanitized data:', data);
    // Data has been sanitized:
    // - email: 'john@example.com'
    // - status: 'ACTIVE'
} else {
    console.log('Validation errors:');
    result.errors.forEach(error => {
        console.log(`${error.field}: ${error.message}`);
    });
}
```

## Express Integration Example

```typescript
import express from 'express';
import beanValidator, {StringValidator, NumberValidator, EnumValidator} from '@ticatec/bean-validator';

const app = express();
app.use(express.json());

// Define validation rules
const userCreateRules = [
    new StringValidator('name', {
        name: 'Full Name',
        required: true,
        maxLen: 100
    }),
    new StringValidator('email', {
        name: 'Email Address',
        required: true,
        toLowerCase: true,
        maxLen: 100,
        format: {
            regex: /^[^\s@]+@[^\s@]+\.[^\s@]+$/,
            message: 'Invalid email format'
        }
    }),
    new NumberValidator('age', {
        required: true,
        minValue: 18,
        maxValue: 120
    }),
    new EnumValidator('status', {
        defaultValue: 'active',
        values: ['active', 'inactive']
    })
];

app.post('/users', (req, res) => {
    const result = beanValidator.validate(req.body, userCreateRules);

    if (!result.valid) {
        return res.status(400).json({
            success: false,
            errors: result.errors
        });
    }

    // Process the validated and sanitized data
    const user = createUser(req.body);
    res.status(201).json({
        success: true,
        data: user
    });
});

app.listen(3000);
```

## API Reference

### beanValidator.validate(data, rules, prefix?)

Validates data against the provided rules.

**Parameters:**
- `data`: The object to validate. A root that is not an object (`null`, a
  primitive - a client posting a bare `null` JSON body, for example) is handled
  without throwing: writes are skipped and required fields simply report
  `cannot be empty`.
- `rules`: Array of validation rules
- `prefix`: Internal use for nested validation

**Returns:** `ValidationResult`

### Exports

| Export | Kind | Purpose |
|---|---|---|
| `beanValidator` (default) | object | `validate(data, rules, prefix?)` |
| `StringValidator`, `NumberValidator`, `DateValidator`, `BooleanValidator`, `EnumValidator`, `ArrayValidator`, `ObjectValidator`, `CommonValidator` | class | The validators |
| `BaseValidator` | class | Extend it to write your own |
| `ValidationResult` | class | The result object |
| `setLocaleMessage`, `resetLocaleMessage`, `getMessage`, `DEFAULT_MESSAGES` | function / const | Message templates |
| `ValidationRules`, `ValidationError`, `ValidatorOptions`, `CustomCheck`, `IgnoreCheck`, `LocaleMessages`, and every `*ValidatorOptions` | type | Type-only exports |

## Requirements

- **Node.js**: ≥18.0.0
- **Peer dependency**: `@ticatec/logger-api` (≥1.0.0, itself dependency-free)
- No other runtime dependencies

## License

MIT

## Repository

This package lives in the [Keelson](https://github.com/ticatec/keelson) monorepo.

- **Source**: [github.com/ticatec/keelson/tree/main/packages/bean-validator](https://github.com/ticatec/keelson/tree/main/packages/bean-validator)
- **Issues**: [github.com/ticatec/keelson/issues](https://github.com/ticatec/keelson/issues)
- **Changelog**: [CHANGELOG.md](./CHANGELOG.md)

## Author

Henry Feng