/** @type {import('ts-jest').JestConfigWithTsJest} */
module.exports = {
    preset: 'ts-jest',
    testEnvironment: 'node',
    roots: ['<rootDir>/src'],
    testMatch: ['**/__tests__/**/*.test.ts', '**/?(*.)+(spec|test).ts'],
    transform: {
        // 显式指定 commonjs：tsconfig.json 现在用的是 NodeNext，ts-jest 会照抄，
        // 于是 `await import(...)` 被原样保留为动态 import，而 Jest 的 CJS 运行时
        // 需要 --experimental-vm-modules 才能执行它。
        '^.+\\.ts$': ['ts-jest', { tsconfig: { module: 'commonjs' } }],
    },
    moduleNameMapper: {
        '^(\\.{1,2}/.*)\\.js$': '$1'
    },
    collectCoverageFrom: [
        'src/**/*.ts',
        '!src/**/*.d.ts',
        '!src/test/**',
    ],
    moduleFileExtensions: ['ts', 'js', 'json', 'node'],
    coverageDirectory: 'coverage',
    verbose: true,
    testTimeout: 10000,
};