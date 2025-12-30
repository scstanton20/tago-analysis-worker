// eslint.config.js - ESM format
import js from '@eslint/js';
import globals from 'globals';
import react from 'eslint-plugin-react';
import reactHooks from 'eslint-plugin-react-hooks';
import reactRefresh from 'eslint-plugin-react-refresh';
import reactCompiler from 'eslint-plugin-react-compiler';
import jsxA11y from 'eslint-plugin-jsx-a11y';
import nodePlugin from 'eslint-plugin-n';
import securityPlugin from 'eslint-plugin-security';
import ymlPlugin from 'eslint-plugin-yml';
import prettierPlugin from 'eslint-plugin-prettier';
import prettierConfig from 'eslint-config-prettier';
import tseslint from '@typescript-eslint/eslint-plugin';
import tsparser from '@typescript-eslint/parser';
import importPlugin from 'eslint-plugin-import';

// Shared rule sets
const baseRules = {
  'no-var': 'error',
  'prefer-const': 'error',
  'prettier/prettier': 'error',
};

const tsRules = {
  ...tseslint.configs.recommended.rules,
  'no-unused-vars': 'off',
  '@typescript-eslint/no-unused-vars': [
    'error',
    { varsIgnorePattern: '^[A-Z_]', argsIgnorePattern: '^_' },
  ],
  'no-redeclare': 'off', // TypeScript handles this
};

const reactRules = {
  ...reactHooks.configs.recommended.rules,
  ...jsxA11y.flatConfigs.recommended.rules,
  'react-compiler/react-compiler': 'warn',
  'react-refresh/only-export-components': [
    'warn',
    { allowConstantExport: true },
  ],
  'jsx-a11y/control-has-associated-label': [
    'error',
    {
      labelAttributes: ['label', 'aria-label'],
      controlComponents: ['Button', 'ActionIcon'],
      ignoreElements: ['a', 'button', 'input', 'select', 'textarea'],
      ignoreRoles: [
        'link',
        'button',
        'checkbox',
        'switch',
        'radio',
        'tab',
        'option',
      ],
      depth: 3,
    },
  ],
};

const mantineRestrictions = {
  'no-restricted-imports': [
    'error',
    {
      paths: [
        {
          name: '@mantine/core',
          importNames: ['Button'],
          message:
            'Use semantic button components from "../global": PrimaryButton, SecondaryButton, DangerButton, SuccessButton, UtilityButton, CancelButton, or FormActionButtons',
        },
        {
          name: '@mantine/core',
          importNames: ['Alert'],
          message:
            'Use FormAlert from "../global" for consistent alert styling.',
        },
      ],
    },
  ],
  'no-restricted-syntax': [
    'error',
    {
      selector:
        'ImportDeclaration[source.value*="/buttons/"] > ImportDefaultSpecifier',
      message: 'Use named imports: import { PrimaryButton } from "../global"',
    },
    {
      selector:
        'ImportDeclaration[source.value="../global"] > ImportDefaultSpecifier',
      message:
        'Use named imports: import { PrimaryButton, FormAlert } from "../global"',
    },
  ],
};

const nodeSecurityRules = {
  'no-return-await': 'error',
  'security/detect-buffer-noassert': 'error',
  'security/detect-child-process': 'warn',
  'security/detect-eval-with-expression': 'error',
  'security/detect-no-csrf-before-method-override': 'error',
  'security/detect-non-literal-fs-filename': 'warn',
  'security/detect-non-literal-regexp': 'warn',
  'security/detect-non-literal-require': 'warn',
  'security/detect-possible-timing-attacks': 'warn',
  'security/detect-unsafe-regex': 'error',
};

const nodePreferGlobals = {
  'node/prefer-global/buffer': ['error', 'always'],
  'node/prefer-global/console': ['error', 'always'],
  'node/prefer-global/process': ['error', 'always'],
  'node/prefer-global/url-search-params': ['error', 'always'],
  'node/prefer-global/url': ['error', 'always'],
  'node/prefer-promises/dns': 'error',
  'node/prefer-promises/fs': 'error',
};

export default [
  // Ignores
  {
    ignores: [
      'apps/frontend/dist',
      'node_modules/',
      'apps/**/node_modules/',
      'apps/backend/build/',
      'packages/types/dist/',
      '.pnpm',
      'apps/backend/analyses-storage/',
      // YAML files with special syntax that eslint-plugin-yml can't parse
      'docker-compose*.yaml',
      'pnpm-lock.yaml',
      'pnpm-workspace.yaml',
      'style-guide/',
    ],
  },

  // Base JavaScript
  {
    files: ['**/*.{js,jsx}'],
    languageOptions: {
      ecmaVersion: 'latest',
      sourceType: 'module',
    },
    plugins: { prettier: prettierPlugin },
    rules: {
      ...js.configs.recommended.rules,
      ...baseRules,
      'no-unused-vars': ['error', { varsIgnorePattern: '^[A-Z_]' }],
    },
  },

  // Base TypeScript
  {
    files: ['**/*.{ts,tsx}'],
    languageOptions: {
      ecmaVersion: 'latest',
      sourceType: 'module',
      parser: tsparser,
      parserOptions: { ecmaFeatures: { jsx: true } },
    },
    plugins: {
      '@typescript-eslint': tseslint,
      prettier: prettierPlugin,
    },
    rules: {
      ...js.configs.recommended.rules,
      ...baseRules,
      ...tsRules,
    },
  },

  // Shared types package
  {
    files: ['**/packages/types/**/*.ts'],
    languageOptions: {
      globals: {
        ...globals.node,
        ...globals.browser,
        NodeJS: 'readonly',
        PublicKeyCredential: 'readonly',
        PublicKeyCredentialCreationOptions: 'readonly',
        PublicKeyCredentialRequestOptions: 'readonly',
        AuthenticatorAttestationResponse: 'readonly',
        AuthenticatorAssertionResponse: 'readonly',
      },
    },
    rules: {
      '@typescript-eslint/no-empty-object-type': 'off',
    },
  },

  // Frontend React (JS + TS)
  {
    files: ['**/frontend/**/*.{js,jsx,ts,tsx}'],
    ignores: ['**/frontend/**/components/global/**/*.{js,jsx,ts,tsx}'],
    languageOptions: {
      globals: { ...globals.browser },
      parserOptions: {
        ecmaVersion: 'latest',
        ecmaFeatures: { jsx: true },
      },
    },
    plugins: {
      react,
      'react-hooks': reactHooks,
      'react-refresh': reactRefresh,
      'react-compiler': reactCompiler,
      'jsx-a11y': jsxA11y,
      import: importPlugin,
    },
    settings: {
      'import/resolver': {
        alias: {
          map: [['@', './apps/frontend/src']],
          extensions: ['.js', '.jsx', '.ts', '.tsx'],
        },
      },
    },
    rules: {
      ...reactRules,
      ...mantineRestrictions,
      'import/order': [
        'warn',
        {
          groups: [
            'builtin',
            'external',
            'internal',
            ['parent', 'sibling', 'index'],
          ],
          pathGroups: [
            { pattern: 'react', group: 'external', position: 'before' },
            { pattern: '@/**', group: 'internal', position: 'before' },
          ],
          pathGroupsExcludedImportTypes: ['react'],
          'newlines-between': 'never',
        },
      ],
      // Note: Feature internal imports use relative paths (../api/), so no @/ restriction needed
      // The @ alias is primarily for cross-cutting imports like @/components/global
    },
  },

  // Frontend global components (allow raw Mantine imports)
  {
    files: ['**/frontend/**/components/global/**/*.{js,jsx,ts,tsx}'],
    languageOptions: {
      globals: { ...globals.browser },
      parserOptions: {
        ecmaVersion: 'latest',
        ecmaFeatures: { jsx: true },
      },
    },
    plugins: {
      react,
      'react-hooks': reactHooks,
      'react-refresh': reactRefresh,
      'react-compiler': reactCompiler,
      'jsx-a11y': jsxA11y,
    },
    rules: {
      ...reactRules,
      'no-restricted-imports': 'off',
    },
  },

  // Backend Node.js (JS)
  {
    files: ['**/backend/**/*.{js,mjs,cjs}'],
    languageOptions: { globals: { ...globals.node } },
    plugins: {
      node: nodePlugin,
      security: securityPlugin,
    },
    rules: {
      ...nodeSecurityRules,
      ...nodePreferGlobals,
      'require-atomic-updates': 'error',
      'node/exports-style': ['error', 'module.exports'],
      'node/file-extension-in-import': ['error', 'always'],
      'node/no-unpublished-require': 'off',
    },
  },

  // Backend Node.js (TS)
  {
    files: ['**/backend/**/*.ts'],
    languageOptions: {
      globals: {
        ...globals.node,
        NodeJS: 'readonly',
        BufferEncoding: 'readonly',
      },
    },
    plugins: {
      node: nodePlugin,
      security: securityPlugin,
    },
    rules: {
      ...nodeSecurityRules,
      ...nodePreferGlobals,
      'require-atomic-updates': 'off', // False positives with Express middleware
    },
  },

  // YAML files
  {
    files: ['*.yaml'],
    plugins: { yml: ymlPlugin },
    languageOptions: { parser: ymlPlugin.parser },
    rules: {
      'yml/quotes': ['error', { prefer: 'single', avoidEscape: true }],
      'yml/no-empty-document': 'error',
      'yml/no-empty-mapping-value': 'error',
      'yml/no-empty-sequence-entry': 'error',
      'yml/no-irregular-whitespace': 'error',
      'yml/plain-scalar': ['error', 'always'],
      'yml/indent': ['error', 2],
      'yml/spaced-comment': ['error', 'always'],
    },
  },

  // Test files - relaxed rules for mocking
  {
    files: ['**/*.test.{js,jsx,ts,tsx}', '**/tests/**/*.{js,jsx,ts,tsx}'],
    rules: {
      'no-unused-vars': 'off',
      '@typescript-eslint/no-unused-vars': [
        'error',
        { varsIgnorePattern: '^_|^[A-Z_]', argsIgnorePattern: '^_' },
      ],
      '@typescript-eslint/no-explicit-any': 'off', // Allow any for mocking
    },
  },

  // Prettier must be last
  prettierConfig,
];
