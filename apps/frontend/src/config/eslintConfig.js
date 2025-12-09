/**
 * ESLint configuration for CodeMirror JavaScript linting
 * Configured for Tago.io analysis context with SDK globals
 * @module config/eslintConfig
 */

import globals from 'globals';

/**
 * ESLint flat config for analysis scripts
 * Includes Tago SDK globals and common rules
 */
export const eslintConfig = {
  languageOptions: {
    ecmaVersion: 2022,
    sourceType: 'module',
    parserOptions: {
      ecmaFeatures: {
        jsx: false,
      },
    },
    globals: {
      // Node.js built-in globals
      ...globals.node,
      // Tago SDK globals available in analysis context
      context: 'readonly',
      account: 'readonly',
      device: 'readonly',
      analysis: 'readonly',
      scope: 'readonly',
    },
  },
  rules: {
    'no-undef': 'warn',
    'no-unused-vars': 'warn',
    'no-redeclare': 'error',
    'no-const-assign': 'error',
    'no-dupe-keys': 'error',
    'no-duplicate-case': 'error',
    'no-unreachable': 'warn',
    'no-empty': 'warn',
    'no-debugger': 'warn',
    semi: ['warn', 'always'],
    quotes: ['warn', 'single'],
  },
};
