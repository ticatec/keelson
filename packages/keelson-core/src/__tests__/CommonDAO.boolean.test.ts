import CommonDAO from '../CommonDAO';
import DBConnection from '../db/DBConnection.js';

class TestDAO extends CommonDAO {
    public constructor() {
        super();
    }
    protected async getDBConnection(): Promise<any> {
        return null;
    }
}

describe('CommonDAO boolean write-direction helpers', () => {
    let dao: any;

    beforeEach(() => {
        dao = new TestDAO();
    });

    test('toBooleanChar formats a boolean for a CHAR column', () => {
        expect(dao.toBooleanChar(true)).toBe('T');
        expect(dao.toBooleanChar(false)).toBe('F');
    });

    test('toBooleanInt formats a boolean for an integer column', () => {
        expect(dao.toBooleanInt(true)).toBe(1);
        expect(dao.toBooleanInt(false)).toBe(0);
    });

    test('the old names are gone, so the same-name-opposite-direction trap cannot come back', () => {
        // 旧名 getBoolean 与 DBConnection.getBoolean(value: any): boolean 同名反向。
        // 在 DAO 里写 this.getBoolean(row.isActive) 会编译通过并拿到 'T'——
        // 名字读起来像读取，做的却是写入。1.0.0 未发布，直接改名，不留兼容别名。
        expect(dao.getBoolean).toBeUndefined();
        expect(dao.getBooleanValue).toBeUndefined();
    });

    test('the read direction still lives on DBConnection and is unaffected', () => {
        expect(typeof (DBConnection.prototype as any).getBoolean).toBe('function');
        expect((DBConnection.prototype as any).getBoolean('false')).toBe(false);
        expect((DBConnection.prototype as any).getBoolean('T')).toBe(true);
    });
});
