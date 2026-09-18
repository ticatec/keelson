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

## Installation

```shell
npm i @ticatec/bean-validator
```

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

#### Example

```typescript
new DateValidator('birthDate', {
    required: true,
    maxDaysBefore: 36500  // Allow dates up to 100 years ago
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

type CustomCheck = (value: any, data: any, prefix: string) => string | null;
type IgnoreCheck = (value: any, data: any) => boolean;
```

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
- `data`: The object to validate
- `rules`: Array of validation rules
- `prefix`: Internal use for nested validation

**Returns:** `ValidationResult`

## License

MIT

## Repository

- GitHub: https://github.com/ticatec/node-library
- Issues: https://github.com/ticatec/bean-validator/issues

## Author

Henry Feng