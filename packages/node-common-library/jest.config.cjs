module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  roots: ['<rootDir>/src'],
  testMatch: ['**/__tests__/**/*.test.ts'],
  collectCoverageFrom: [
    'src/**/*.ts',
    '!src/**/*.d.ts'
  ],
  transform: {
    // 显式指定 commonjs。基础配置用的是 NodeNext，此前 ts-jest 因为 isolatedModules
    // 未开而静默降级成 commonjs；开启之后它会照搬 NodeNext，于是测试文件被编成 ESM，
    // Jest 的 CJS 运行时报 "Cannot use import statement outside a module"。
    '^.+\\.tsx?$': ['ts-jest', { tsconfig: { module: 'commonjs' } }]
  },
  transformIgnorePatterns: [
    'node_modules/(?!(uuid)/)'
  ],
  moduleNameMapper: {
    '^(\\.{1,2}/.*)\\.js$': '$1'
  },
  moduleFileExtensions: ['ts', 'tsx', 'js', 'jsx', 'json', 'node']
};
