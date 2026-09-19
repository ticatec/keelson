import { setLoggerProvider, resetLoggerProvider } from '@ticatec/logger-api';
import type { Logger } from '@ticatec/logger-api';
import StringUtils from '../StringUtils';
import DBConnection from '../db/DBConnection';
import ThreadLocal from '../ThreadLocal';

type Rec = { level: string; ctx: unknown; msg?: string };
const records: Rec[] = [];
const capture = (level: string) => (a: unknown, b?: string) => {
    records.push({ level, ctx: a, msg: b });
};
const spy: Logger = {
    trace: capture('trace'), debug: capture('debug'), info: capture('info'),
    warn: capture('warn'), error: capture('error')
} as Logger;

beforeEach(() => {
    records.length = 0;
    resetLoggerProvider();
    setLoggerProvider(() => spy);
});
afterEach(() => resetLoggerProvider());

describe('StringUtils.isNumber', () => {
    // Number('') and Number('   ') are both 0, so !isNaN(...) held and an empty
    // value passed as a valid number - typically read downstream as 0.
    it.each(['', ' ', '   ', '\t', '\n', '\t \n'])('rejects the blank string %j', (input) => {
        expect(StringUtils.isNumber(input)).toBe(false);
    });

    it.each(['0', '12', '-3', '3.5', '1e3', ' 42 '])('still accepts %j', (input) => {
        expect(StringUtils.isNumber(input)).toBe(true);
    });

    it.each(['abc', '12abc', '1,000', 'NaN'])('still rejects %j', (input) => {
        expect(StringUtils.isNumber(input)).toBe(false);
    });

    it.each([[null], [undefined], [12], [{}], [[]]])('rejects the non-string %p', (input) => {
        expect(StringUtils.isNumber(input as never)).toBe(false);
    });

    it('keeps parseNumber falling back for a blank string', () => {
        expect(StringUtils.parseNumber('', -1)).toBe(-1);
        expect(StringUtils.parseNumber('   ', -1)).toBe(-1);
    });
});

class Probe extends DBConnection {
    protected async fetchData(): Promise<any> { return null; }
    protected async executeUpdate(): Promise<number> { return 0; }
    async beginTransaction(): Promise<void> { /* noop */ }
    async commit(): Promise<void> { /* noop */ }
    async rollback(): Promise<void> { /* noop */ }
    async close(): Promise<void> { /* noop */ }
    getPlaceholder(index: number): string { return `$${index}`; }
    protected getFields(): any { return []; }
    protected getFirstRow(): any { return null; }
    protected resultToList(): any { return []; }

    camel(name: string): string { return (this as any).toCamel(name); }
    nest(obj: any, field: string, value: any): void { (this as any).setNestObj(obj, field, value); }
}

describe('DBConnection.toCamel', () => {
    const probe = new Probe();

    // Dameng, Oracle and unquoted PostgreSQL all return upper-case column names.
    // The old implementation only upper-cased the letter after an underscore and
    // left everything else alone, so USER_NAME became USERNAME and STATUS stayed
    // STATUS - which is why the DM driver had to override this method.
    it.each([
        ['USER_NAME', 'userName'],
        ['ORDER_STATUS', 'orderStatus'],
        ['STATUS', 'status'],
        ['ID', 'id'],
        ['CREATED_AT_UTC', 'createdAtUtc'],
        ['ROW_1_VALUE', 'row1Value']
    ])('normalises the upper-case %s to %s', (input, expected) => {
        expect(probe.camel(input)).toBe(expected);
    });

    it.each([
        ['user_name', 'userName'],
        ['created_at', 'createdAt'],
        ['userName', 'userName'],
        ['id', 'id']
    ])('leaves the already-lower-case %s as %s', (input, expected) => {
        expect(probe.camel(input)).toBe(expected);
    });

    it('does not touch a mixed-case name', () => {
        expect(probe.camel('User_Name')).toBe('UserName');
    });
});

describe('DBConnection.setNestObj', () => {
    const probe = new Probe();

    it('builds the nested structure', () => {
        const obj: any = {};
        probe.nest(obj, 'user.profile.email', 'a@b.c');
        expect(obj).toEqual({ user: { profile: { email: 'a@b.c' } } });
    });

    it('camel-cases every segment', () => {
        const obj: any = {};
        probe.nest(obj, 'USER_INFO.HOME_CITY', 'Auckland');
        expect(obj).toEqual({ userInfo: { homeCity: 'Auckland' } });
    });

    // A column alias can come from dynamically built SQL. '__proto__' only
    // happened to be harmless because toCamel rewrote it to '_proto_';
    // 'constructor.prototype.x' threw a TypeError and took the whole row mapping
    // down with it.
    it.each([
        '__proto__.isAdmin',
        'a.__proto__.isAdmin',
        'constructor.prototype.polluted',
        'a.constructor.prototype.polluted',
        'prototype.x',
        'CONSTRUCTOR.PROTOTYPE.X',
        'a.PROTOTYPE.x'
    ])('refuses the path %s', (field) => {
        const obj: any = {};
        expect(() => probe.nest(obj, field, 'pwned')).not.toThrow();
        expect(obj).toEqual({});
        expect(({} as any).isAdmin).toBeUndefined();
        expect(({} as any).polluted).toBeUndefined();
        expect(({} as any).x).toBeUndefined();
    });

    it('allows a name that merely resembles a reserved key', () => {
        const obj: any = {};
        probe.nest(obj, 'proto_type.value', 'ok');
        expect(obj).toEqual({ protoType: { value: 'ok' } });
    });

    it('leaves a primitive on the path alone instead of replacing it', () => {
        const obj: any = { a: 0 };
        probe.nest(obj, 'a.b', 'z');
        expect(obj.a).toBe(0);
    });

    it('ignores an undefined value, as before', () => {
        const obj: any = {};
        probe.nest(obj, 'a.b', undefined);
        expect(obj).toEqual({});
    });
});

describe('ThreadLocal', () => {
    // This used to be a bare console.warn, bypassing the logger-api pipeline
    // entirely: not filtered by LOG_LEVEL, not routed to the application's sinks.
    it('warns through logger-api when set() is called outside a context', () => {
        new ThreadLocal<{ a: number }>().set({ a: 1 });

        const rec = records.find((r) => (r.msg ?? '').includes('outside of an active context'));
        expect(rec).toBeDefined();
        expect(rec!.level).toBe('warn');
    });

    it('stays quiet inside a context and merges the value', () => {
        const tl = new ThreadLocal<{ a: number; b?: number }>();
        tl.run({ a: 1 }, () => {
            tl.set({ b: 2 } as never);
            expect(tl.get()).toEqual({ a: 1, b: 2 });
        });
        expect(records).toHaveLength(0);
    });
});
