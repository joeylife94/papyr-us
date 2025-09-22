module.exports = {
  // Legacy ESLint config (not the new flat config)
  root: true,
  parser: '@typescript-eslint/parser',
  parserOptions: {
    project: ['./tsconfig.json'],
    ecmaVersion: 2022,
    sourceType: 'module',
  },
  plugins: ['@typescript-eslint', 'prettier'],
  extends: ['eslint:recommended', 'plugin:@typescript-eslint/recommended', 'prettier'],
  rules: {
    'no-console': 'off',
    '@typescript-eslint/explicit-module-boundary-types': 'off',
  },
  ignorePatterns: ['dist/', 'node_modules/'],
};
