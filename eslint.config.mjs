/**
 * ESLint configuration (flat config).
 *
 * Real problems are errors; stylistic or noisy rules are warnings so that
 * `npm run lint` stays usable as a CI gate.
 */
import js from '@eslint/js';
import globals from 'globals';
import tseslint from 'typescript-eslint';
import react from 'eslint-plugin-react';
import reactHooks from 'eslint-plugin-react-hooks';
import importPlugin from 'eslint-plugin-import';
import jsxA11y from 'eslint-plugin-jsx-a11y';
import promise from 'eslint-plugin-promise';

const vitestGlobals = Object.fromEntries(
  ['describe', 'it', 'test', 'expect', 'vi', 'beforeAll', 'beforeEach', 'afterAll', 'afterEach'].map(
    (name) => [name, 'readonly'],
  ),
);

export default tseslint.config(
  { ignores: ['node_modules', '.vite', 'out', 'dist', 'coverage'] },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  react.configs.flat.recommended,
  react.configs.flat['jsx-runtime'],
  {
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: 'module',
      globals: { ...globals.browser, ...globals.node },
    },
    plugins: {
      'react-hooks': reactHooks,
      import: importPlugin,
      // Registered (no rules enabled) because existing sources carry
      // eslint-disable comments for these plugins' rules
      'jsx-a11y': jsxA11y,
      promise,
    },
    settings: { react: { version: 'detect' } },
    rules: {
      // Module resolution and named exports are verified by `tsc` (typecheck)
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
  },
  {
    files: ['**/*.test.ts', '**/*.test.tsx', '**/__tests__/**'],
    languageOptions: { globals: vitestGlobals },
    rules: {
      '@typescript-eslint/no-explicit-any': 'off',
      '@typescript-eslint/no-non-null-assertion': 'off',
    },
  },
  {
    // Node-side config files (CommonJS)
    files: ['*.js', '*.cjs'],
    languageOptions: { sourceType: 'commonjs', globals: globals.node },
    rules: { '@typescript-eslint/no-require-imports': 'off' },
  },
);
