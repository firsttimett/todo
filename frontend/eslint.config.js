import js from '@eslint/js';
import simpleImportSort from 'eslint-plugin-simple-import-sort';
import globals from 'globals';
import tseslint from 'typescript-eslint';

const sharedLanguageOptions = {
  ecmaVersion: 'latest',
  sourceType: 'module',
  parserOptions: {
    ecmaFeatures: {
      jsx: true,
    },
  },
};

const sharedConfig = {
  extends: [js.configs.recommended, ...tseslint.configs.recommended],
  plugins: {
    'simple-import-sort': simpleImportSort,
  },
  rules: {
    '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_' }],
    'simple-import-sort/imports': 'error',
    'simple-import-sort/exports': 'error',
  },
};

export default tseslint.config(
  {
    ignores: ['dist', 'node_modules'],
  },
  {
    ...sharedConfig,
    files: ['src/**/*.{ts,tsx}'],
    languageOptions: {
      ...sharedLanguageOptions,
      globals: globals.browser,
    },
  },
  {
    ...sharedConfig,
    files: ['vite.config.ts'],
    languageOptions: {
      ...sharedLanguageOptions,
      globals: globals.node,
    },
  },
);
