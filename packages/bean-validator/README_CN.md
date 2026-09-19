# Bean Validator

[![Version](https://img.shields.io/npm/v/@ticatec/bean-validator)](https://www.npmjs.com/package/@ticatec/bean-validator)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

一个灵活而强大的 Node.js 验证库，通过基于规则的验证来校验 JavaScript 对象，并支持数据清理。

[English](README.md) | 中文文档

## 特性

- ✅ **双模式模块支持**: 原生支持 ES Modules (ESM) 与 CommonJS (CJS)
- ✅ **类型安全**: 使用 TypeScript 构建，提供完整的类型安全
- ✅ **数据清理**: 自动数据清理和标准化（自动 Trim、大小写转换、数字舍入）
- ✅ **默认值**: 为缺失或空字段设置默认值
- ✅ **类型转换**: 自动类型转换（字符串转数字、日期转换等）
- ✅ **嵌套验证**: 支持嵌套对象和数组
- ✅ **自定义验证**: 灵活的自定义验证函数
- ✅ **结构化错误**: 详细的错误对象，便于错误处理
- ✅ **字段别名**: 在错误消息中使用友好的字段名
- ✅ **本地化**: 可整体或部分覆盖任意消息模板
- ✅ **空即是空**: 表单里没填的字段报「不能为空」，而不是类型错误
- ✅ **内置日志**: 校验失败经 `@ticatec/logger-api` 契约记录

## 安装

```shell
npm i @ticatec/bean-validator @ticatec/logger-api
```

`@ticatec/logger-api` 是 peer dependency——本包记录日志所依赖的零依赖日志契约，详见 [日志](#日志)。

## 导入规范

**ES Modules (ESM):**
```typescript
import beanValidator, { StringValidator, NumberValidator, EnumValidator } from "@ticatec/bean-validator";
```

**CommonJS (CJS):**
```javascript
const beanValidator = require("@ticatec/bean-validator").default;
const { StringValidator, NumberValidator, EnumValidator } = require("@ticatec/bean-validator");
```

## 快速开始

```typescript
import beanValidator, { StringValidator, NumberValidator, EnumValidator } from "@ticatec/bean-validator";

// 定义验证规则
const rules = [
    new StringValidator('email', {
        name: '邮箱地址',
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

// 待验证的数据
const data = {
    email: 'JOHN@EXAMPLE.COM',
    age: 30
};

// 执行验证
const result = beanValidator.validate(data, rules);

if (result.valid) {
    console.log('验证通过！');
    console.log('清理后的数据:', data);
    // 输出: { email: 'john@example.com', age: 30, status: 'active' }
} else {
    console.log('验证错误:', result.errors);
}
```

## 验证器

### 字符串验证器 (StringValidator)

验证并清理字符串值，支持长度约束、格式验证、大小写转换以及可配置的前后空格清理（Trim）。

#### 选项

```typescript
interface StringValidatorOptions extends ValidatorOptions {
    minLen?: number;           // 最小长度
    maxLen?: number;           // 最大长度
    format?: {
        regex: RegExp;         // 格式验证的正则表达式
        message: string;       // 格式验证失败时的错误消息
    };
    toLowerCase?: boolean;     // 转换为小写
    toUpperCase?: boolean;     // 转换为大写
    trim?: boolean;            // 是否自动清理前后空格（默认为 true）
}
```

#### 示例

**基础验证:**
```typescript
new StringValidator('email', {
    required: true,
    maxLen: 100,
    format: {
        regex: /^[^\s@]+@[^\s@]+\.[^\s@]+$/,
        message: '邮箱格式无效'
    }
});
```

**自动清理:**
```typescript
new StringValidator('email', {
    toLowerCase: true  // 自动转换为小写
});

new StringValidator('username', {
    toUpperCase: true  // 自动转换为大写
});
```

### 数字验证器 (NumberValidator)

验证并清理数值，支持范围约束、自动类型转换和舍入。

#### 选项

```typescript
interface NumberValidatorOptions extends ValidatorOptions {
    minValue?: number;        // 最小值
    maxValue?: number;        // 最大值
    round?: number;           // 保留的小数位数
    roundMode?: 'ceil' | 'floor' | 'round';  // 舍入模式
}
```

#### 示例

**基础验证:**
```typescript
new NumberValidator('age', {
    required: true,
    minValue: 0,
    maxValue: 120
});
```

**数字舍入:**
```typescript
new NumberValidator('price', {
    round: 2,              // 保留2位小数
    roundMode: 'round'     // 选项: 'round'(四舍五入), 'ceil'(向上), 'floor'(向下)
});

// 输入: 99.876 → 输出: 99.88
```

**自动类型转换:**
```typescript
new NumberValidator('count', {
    defaultValue: 1
});

// 输入: { count: "5" } → 输出: { count: 5 }
```

**哪些字符串会被接受**

字符串必须是十进制字面量：可带符号，整数、小数、科学计数法均可。转换后的值会写回 bean。

| 接受 | 拒绝 |
|---|---|
| `'12'`、`'  12  '`、`'-3.5'`、`'+7'`、`'.5'` | `'12abc'`、`'1,000'`、`'1 2'` |
| `'1e3'` → `1000`、`'1E-2'` → `0.01` | `'0x1f'`、`'0b101'`、`'0o17'` |
| | `'Infinity'`、`'-Infinity'`、`'NaN'` |

拒绝十六进制与二进制是刻意的：`Number('0x1f')` 等于 31，而这绝不会是一个数字表单域
或 JSON 报文想表达的意思。非有限数无论以字符串还是数字形式传入一律拒绝——`Infinity`
一旦写回 bean，`JSON.stringify` 会变成 `null`，入库也会失败。

### 日期验证器 (DateValidator)

验证日期值，支持日期范围和相对日期约束。

#### 选项

```typescript
interface DateValidatorOptions extends ValidatorOptions {
    from?: Date;              // 允许的最早日期
    to?: Date;                // 允许的最晚日期
    maxDaysBefore?: number;   // 距今最多天数（过去）
    maxDaysAfter?: number;    // 距今最多天数（未来）
}
```

`maxDaysBefore` / `maxDaysAfter` 是**整日**边界，与错误信息里给出的「天」一致：

- `maxDaysBefore: 10` —— 最早可接受的时刻是 10 天前那一天的 `00:00:00.000`，
  因此那一天内的任意时刻都通过。
- `maxDaysAfter: 10` —— 最晚可接受的时刻是 10 天后那一天的 `23:59:59.999`。

日期运算走日历日而非加减 86400000 毫秒，跨夏令时切换不会偏差一小时。

`from` 与 `to` 是确切时刻，按精确值比较——需要比「天」更细的粒度时用它们。

#### 示例

```typescript
new DateValidator('birthDate', {
    required: true,
    maxDaysBefore: 36500  // 允许100年前的日期
});

new DateValidator('startsAt', {
    from: new Date('2026-06-15T12:00:00Z')  // 确切时刻，而非一整天
});
```

### 枚举验证器 (EnumValidator)

验证值是否在预定义的允许值集合中。

#### 选项

```typescript
interface EnumValidatorOptions extends ValidatorOptions {
    values: Array<any>;  // 允许的值数组
}
```

#### 示例

```typescript
new EnumValidator('status', {
    defaultValue: 'active',
    values: ['active', 'inactive', 'pending']
});
```

### 布尔值验证器 (BooleanValidator)

验证布尔值，支持自动类型转换。

#### 示例

```typescript
new BooleanValidator('isActive', {
    defaultValue: false
});

// 接受: true, false, 0, 1, "true", "false", "1", "0"
//       （字符串会去除两端空白，且不区分大小写）
// 其余一律视为类型错误，包括别的数字：42 与 "42" 都报错，
// 而不是 42 悄悄变成 true。
```

### 对象验证器 (ObjectValidator)

通过验证规则来验证嵌套对象的属性。

#### 选项

```typescript
interface ObjectValidatorOptions extends ValidatorOptions {
    rules: Array<BaseValidator>;  // 嵌套对象的验证规则
}
```

#### 示例

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

### 数组验证器 (ArrayValidator)

验证数组，支持长度约束和元素验证。

#### 选项

```typescript
interface ArrayValidatorOptions extends ValidatorOptions {
    rules?: Array<BaseValidator>;  // 数组元素的验证规则
    minLen?: number;               // 最小数组长度
    maxLen?: number;               // 最大数组长度
}
```

#### 示例

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

## 通用选项

所有验证器都继承自 `BaseValidator` 并支持这些通用选项：

```typescript
interface ValidatorOptions {
    required?: boolean;      // 字段是否必需
    name?: string;          // 用于错误消息的友好字段名
    defaultValue?: any;     // 字段为 null/undefined/空时的默认值
    check?: CustomCheck;     // 自定义验证函数
    ignoreWhen?: IgnoreCheck; // 条件性跳过验证
}

type CustomCheck = (value: any, data: any, prefix: string | null) => any;
type IgnoreCheck = (value: any, data: any) => boolean;
```

### 空值处理

HTML 表单里未填写的输入框提交上来的是空字符串，不是 `null`。所有校验器都把它视为「没填」：

| 字段状态 | `required: true` | `required: false` |
|---|---|---|
| 键缺失、`null`、`undefined` | `cannot be empty` | 跳过 |
| `''` | `cannot be empty` | 跳过 |
| `'   '`（纯空白） | `cannot be empty` | 跳过 |

留空的字段也不会再去比对 `minLen`、`maxLen` 与 `format`——非必填字段留空与
干脆不传这个键，行为是一致的。

```typescript
const rules = [new NumberValidator('age', { required: true })];

beanValidator.validate({ age: '' }, rules).errorMessage;
// "age: cannot be empty"   —— 而不是 "age: is not a valid number"

beanValidator.validate({ age: '' }, [new NumberValidator('age', {})]).valid;
// true —— 非必填字段留空，就是没填
```

对于 `StringValidator`，非必填字段留空（`''`，或在默认 `trim: true` 下的纯空白
字符串）同样会跳过 `minLen`、`maxLen` 与 `format` 约束；必填字段留空则报
`cannot be empty`。当设置 `trim: false` 时，空白将被保留并作为非空值计入字符
长度。

```typescript
// 非必填字段留空，不受 minLen / format 约束
beanValidator.validate({ note: '' }, [new StringValidator('note', { minLen: 3 })]).valid;      // true
beanValidator.validate({ note: 'ab' }, [new StringValidator('note', { minLen: 3 })]).valid;    // false

// trim: false 时空白被保留并计入长度
beanValidator.validate({ note: '   ' }, [new StringValidator('note', { minLen: 3, trim: false })]).valid;  // true
```

`defaultValue` 优先于以上全部规则：空值会先被默认值替换，再按正常流程校验。

### 字段别名

使用 `name` 选项在错误消息中显示友好的字段名：

```typescript
new StringValidator('usr_email', {
    name: '邮箱地址',
    required: true
});

// 错误消息: "邮箱地址: 不能为空"
```

### 默认值

为缺失或空字段设置默认值：

```typescript
new StringValidator('status', {
    defaultValue: 'active'
});

new NumberValidator('quantity', {
    defaultValue: 1,
    round: 0  // 同时舍入为整数
});
```

### 自定义验证

使用 `check` 选项添加自定义验证逻辑：

```typescript
new StringValidator('username', {
    required: true,
    minLen: 3,
    maxLen: 20,
    check: (value, data, prefix) => {
        if (value.includes(' ')) {
            return '用户名不能包含空格';
        }
        return null; // null 表示验证通过
    }
});
```

返回纯字符串时，错误会归到该 check 所挂载的字段上，因此 `error.field` 可以直接用来
把红框标到对应的输入组件：

```typescript
beanValidator.validate({ username: 'a b' }, rules).errors;
// [ { field: 'username', message: '用户名不能包含空格' } ]
```

若问题其实属于另一个字段（例如跨字段校验），返回 `ValidationError` 对象：

```typescript
check: (value, data) => (value < data.startDate
    ? { field: 'endDate', message: '结束日期必须晚于开始日期' }
    : null)
```

### 条件性验证

使用 `ignoreWhen` 根据条件跳过验证：

```typescript
new StringValidator('phone', {
    required: true,
    ignoreWhen: (value, data) => {
        // 如果提供了邮箱，则跳过电话验证
        return !!data.email;
    }
});
```

## 验证结果

验证结果提供简单和结构化的错误信息：

```typescript
interface ValidationResult {
    valid: boolean;              // 验证是否通过
    errorMessage: string;        // 所有错误的字符串形式（向后兼容）
    errors: ValidationError[];   // 结构化错误数组
}

interface ValidationError {
    field: string;              // 字段名（或别名）
    message: string;            // 错误消息
}
```

### 使用示例

**简单错误消息:**
```typescript
if (!result.valid) {
    console.log(result.errorMessage);
    // 输出:
    // 邮箱地址: 不能为空
    // 年龄: 不能小于最小值 0
}
```

`errors` 返回的是列表副本，改动返回的数组不会影响校验结果。

**结构化错误:**
```typescript
if (!result.valid) {
    result.errors.forEach(error => {
        console.log(`${error.field}: ${error.message}`);
    });
}

// 或在 API 响应中使用:
res.status(400).json({
    errors: result.errors
});
```

**响应格式:**
```json
{
  "errors": [
    {
      "field": "邮箱地址",
      "message": "不能为空"
    },
    {
      "field": "年龄",
      "message": "不能小于最小值 0"
    }
  ]
}
```

## 高级功能

### 嵌套字段访问

使用点符号访问和验证嵌套属性：

```typescript
new StringValidator('user.profile.email', {
    name: '邮箱',
    required: true,
    toLowerCase: true
});
```

### 数据清理

库在验证期间自动清理数据：

**字符串清理:**
```typescript
// 去除空白并转换大小写
new StringValidator('email', {
    toLowerCase: true
});
// 输入: "  JOHN@EXAMPLE.COM  " → 输出: "john@example.com"
```

**数字清理:**
```typescript
// 转换类型并舍入
new NumberValidator('price', {
    round: 2
});
// 输入: "99.876" → 输出: 99.88
```

**组合清理:**
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

// 结果:
// {
//   email: 'user@example.com',
//   status: 'ACTIVE',
//   price: 99.88,
//   quantity: 1
// }
```

## 本地化

所有消息都是模板。`setLocaleMessage` 只覆盖传入的键，其余保持不变，因此可以只翻译一部分：

```typescript
import { setLocaleMessage, resetLocaleMessage, getMessage, DEFAULT_MESSAGES } from "@ticatec/bean-validator";

setLocaleMessage({
    REQUIRED: '不能为空',
    INVALID_NUMBER: '不是有效的数字',
    STRING_LENGTH_SHORTAGE: '长度不能少于 {{minLength}} 个字符'
});

// "email: 不能为空"
```

占位符写作 `{{name}}`，由校验器提供的参数填充。全部键见 `LocaleMessages` 接口；
`DEFAULT_MESSAGES` 是内置的英文模板，可作为翻译的起点。`resetLocaleMessage()`
恢复默认，`getMessage()` 返回当前生效的模板。

| 键 | 默认值 | 占位符 |
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

在启动时调用一次即可。消息表由本包的 CommonJS 与 ESM 两份构建共享，因此无论以哪种
方式加载都生效。

## 日志

一次校验若产生了错误，会通过
[`@ticatec/logger-api`](https://www.npmjs.com/package/@ticatec/logger-api) 记录一条：

```
2026-09-18T03:36:39.945Z DEBUG [BeanValidator] Validation failed with 3 error(s) {"errors":[{"field":"Email Address","message":"cannot be empty"},{"field":"age","message":"is not a valid number"},{"field":"user.name","message":"cannot be empty"}]}
```

几点需要知道：

- **级别是 `debug`。** 校验失败是处理不可信输入时的预期结果，属于调用方的问题而非
  服务端故障，在真实流量下用更高的级别记录会把真正要紧的日志淹掉。这与
  `@ticatec/node-exception` 对 4xx 的处理一致。需要查看时把 `LOG_LEVEL` 设为 `debug`。
- **一次校验一条**，而不是每条规则一条、每层嵌套一条。`ObjectValidator` 与
  `ArrayValidator` 内部会递归调用校验入口，只有最外层那次记录。
- **不记录字段值**，只有字段名与渲染后的消息。唯一的例外是你自己在 `check` 回调里
  拼出来的消息，那部分由你掌控。
- **日志失败不会影响校验**：异常会被吞掉，结果照常返回。

未注入 provider 时，`@ticatec/logger-api` 退回写控制台，并按 `LOG_LEVEL` 过滤。
若要接入真正的日志库，在启动时注册一次 provider：

```typescript
import { setLoggerProvider } from '@ticatec/logger-api';
import { initialize, getPinoLogger } from '@ticatec/logger-pino';

initialize({
    appenders: [{ name: 'out', type: 'console', level: 'debug' }],
    loggers: { root: { level: 'debug', appenders: ['out'] } }
});
setLoggerProvider(getPinoLogger);
```

## 完整示例

```typescript
import beanValidator from "@ticatec/bean-validator";
import {StringValidator, NumberValidator, DateValidator, EnumValidator, ObjectValidator, ArrayValidator} from "@ticatec/bean-validator";

// 定义嵌套验证规则
const memberRules = [
    new DateValidator('registerOn', {maxDaysAfter: -5}),
    new StringValidator('password', {
        required: true,
        format: {
            regex: /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)[A-Za-z\d]{8,}$/,
            message: '密码必须至少8位，包含大小写字母和数字'
        }
    })
];

// 定义主要验证规则
const rules = [
    new StringValidator('name', {
        name: '姓名',
        required: true,
        maxLen: 50
    }),
    new NumberValidator('age', {
        required: true,
        minValue: 15,
        maxValue: 90
    }),
    new DateValidator('dob', {
        name: '出生日期',
        maxDaysBefore: 100000
    }),
    new EnumValidator('gender', {
        values: ['F', 'M']
    }),
    new StringValidator('email', {
        toLowerCase: true,
        format: {
            regex: /^[^\s@]+@[^\s@]+\.[^\s@]+$/,
            message: '邮箱格式无效'
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

// 带有子元素的父规则
const parentRules = [
    ...rules,
    new ArrayValidator('children', {
        required: true,
        rules: rules
    })
];

const data = {
    name: '张三',
    age: 35,
    dob: '1988-03-05',
    gender: 'M',
    email: 'ZHANGSAN@EXAMPLE.COM',
    member: {
        registerOn: new Date('2023-01-01'),
        password: 'SecurePass123'
    },
    children: [
        {
            name: '李四',
            age: 16,
            dob: '2007-08-12',
            gender: 'F',
            email: 'lisi@example.com',
            member: {
                registerOn: new Date('2023-06-01'),
                password: 'ChildPass456'
            }
        }
    ]
};

const result = beanValidator.validate(data, parentRules);

if (result.valid) {
    console.log('所有验证通过！');
    console.log('验证和清理后的数据:', data);
    // 数据已被清理:
    // - email: 'zhangsan@example.com'
    // - status: 'ACTIVE'
} else {
    console.log('验证错误:');
    result.errors.forEach(error => {
        console.log(`${error.field}: ${error.message}`);
    });
}
```

## Express 集成示例

```typescript
import express from 'express';
import beanValidator, {StringValidator, NumberValidator, EnumValidator} from '@ticatec/bean-validator';

const app = express();
app.use(express.json());

// 定义验证规则
const userCreateRules = [
    new StringValidator('name', {
        name: '姓名',
        required: true,
        maxLen: 100
    }),
    new StringValidator('email', {
        name: '邮箱地址',
        required: true,
        toLowerCase: true,
        maxLen: 100,
        format: {
            regex: /^[^\s@]+@[^\s@]+\.[^\s@]+$/,
            message: '邮箱格式无效'
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

    // 处理验证和清理后的数据
    const user = createUser(req.body);
    res.status(201).json({
        success: true,
        data: user
    });
});

app.listen(3000);
```

## API 参考

### beanValidator.validate(data, rules, prefix?)

根据提供的规则验证数据。

**参数:**
- `data`: 要验证的对象。根对象若不是对象（`null` 或基本类型——例如客户端把
  JSON 报文体直接发成了一个 `null`），不会抛异常：写回动作被跳过，必填字段照常
  报 `cannot be empty`。
- `rules`: 验证规则数组
- `prefix`: 内部使用，用于嵌套验证

**返回:** `ValidationResult`

### 导出清单

| 导出 | 类别 | 用途 |
|---|---|---|
| `beanValidator`（默认导出） | 对象 | `validate(data, rules, prefix?)` |
| `StringValidator`、`NumberValidator`、`DateValidator`、`BooleanValidator`、`EnumValidator`、`ArrayValidator`、`ObjectValidator`、`CommonValidator` | 类 | 各校验器 |
| `BaseValidator` | 类 | 继承它编写自己的校验器 |
| `ValidationResult` | 类 | 校验结果对象 |
| `setLocaleMessage`、`resetLocaleMessage`、`getMessage`、`DEFAULT_MESSAGES` | 函数 / 常量 | 消息模板 |
| `ValidationRules`、`ValidationError`、`ValidatorOptions`、`CustomCheck`、`IgnoreCheck`、`LocaleMessages` 及全部 `*ValidatorOptions` | 类型 | 仅类型导出 |

## 环境要求

- **Node.js**：≥18.0.0
- **Peer 依赖**：`@ticatec/logger-api`（≥1.0.0，其本身零依赖）
- 除此之外无任何运行时依赖

## 许可证

MIT

## 仓库

本包位于 [Keelson](https://github.com/ticatec/keelson) monorepo。

- **源码**：[github.com/ticatec/keelson/tree/main/packages/bean-validator](https://github.com/ticatec/keelson/tree/main/packages/bean-validator)
- **问题反馈**：[github.com/ticatec/keelson/issues](https://github.com/ticatec/keelson/issues)
- **变更日志**：[CHANGELOG.md](./CHANGELOG.md)

## 作者

Henry Feng