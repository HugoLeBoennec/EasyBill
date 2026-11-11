/**
 * ESLint configuration (ESLint 8, legacy config format).
 *
 * Real problems are errors; stylistic or noisy rules are warnings so that
 * `npm run lint` stays usable as a CI gate.
 */
module.exports = {
  root: true,
  env: {
    browser: true,
    node: true,
    es2022: true,
  },
  parser: '@typescript-eslint/parser',
  parserOptions: {
    ecmaVersion: 2022,
    sourceType: 'module',
    ecmaFeatures: { jsx: true },
  },
  plugins: [
    '@typescript-eslint',
    'react',
    'react-hooks',
    'import',
    // Registered (no rules enabled) because existing sources carry
    // eslint-disable comments for these plugins' rules
    'jsx-a11y',
    'promise',
  ],
  extends: [
    'eslint:recommended',
    'plugin:@typescript-eslint/recommended',
    'plugin:react/recommended',
    'plugin:react/jsx-runtime',
    'plugin:react-hooks/recommended',
    'plugin:import/recommended',
    'plugin:import/typescript',
  ],
  settings: {
    react: { version: 'detect' },
    'import/parsers': {
      '@typescript-eslint/parser': ['.ts', '.tsx', '.mts'],
    },
    'import/resolver': {
      node: { extensions: ['.js', '.jsx', '.ts', '.tsx', '.mts', '.json'] },
    },
    // Provided by the runtime / bundler, not resolvable from node_modules
    'import/core-modules': ['electron'],
  },
  rules: {
    // Module resolution and named exports are verified by `tsc` (typecheck)
    'import/no-unresolved': 'off',
    'import/named': 'off',
    'import/namespace': 'off',
    'import/default': 'off',
    'import/no-named-as-default': 'off',
    'import/no-named-as-default-member': 'off',
    'import/no-duplicates': 'warn',

    // TypeScript
    '@typescript-eslint/no-explicit-any': 'warn',
    '@typescript-eslint/no-unused-vars': [
      'warn',
      { argsIgnorePattern: '^_', varsIgnorePattern: '^_', caughtErrors: 'none' },
    ],
    '@typescript-eslint/no-require-imports': 'warn',
    '@typescript-eslint/ban-ts-comment': 'warn',
    '@typescript-eslint/no-empty-object-type': 'warn',

    // React
    'react/prop-types': 'off', // props are typed with TypeScript
    'react/no-unescaped-entities': 'warn',
    'react/display-name': 'warn',
    'react/jsx-key': 'warn',
    'react-hooks/rules-of-hooks': 'error',
    'react-hooks/exhaustive-deps': 'warn',

    // General
    'no-console': 'off', // main-process logging goes through console
    'no-empty': ['warn', { allowEmptyCatch: true }],
    'prefer-const': 'warn',
    'no-case-declarations': 'warn',
    'no-useless-escape': 'warn',
  },
  overrides: [
    {
      // Test files: vitest globals
      files: ['**/*.test.ts', '**/*.test.tsx', '**/__tests__/**'],
      globals: {
        describe: 'readonly',
        it: 'readonly',
        test: 'readonly',
        expect: 'readonly',
        vi: 'readonly',
        beforeAll: 'readonly',
        beforeEach: 'readonly',
        afterAll: 'readonly',
        afterEach: 'readonly',
      },
      rules: {
        '@typescript-eslint/no-explicit-any': 'off',
        '@typescript-eslint/no-non-null-assertion': 'off',
      },
    },
    {
      // Node-side config files (CommonJS)
      files: ['*.js', '*.cjs'],
      env: { node: true, browser: false },
      parserOptions: { sourceType: 'script' },
      rules: {
        '@typescript-eslint/no-require-imports': 'off',
      },
    },
  ],
};
