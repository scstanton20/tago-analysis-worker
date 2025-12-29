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

export default [
  // Common ignores
  {
    ignores: [
      'apps/frontend/dist',
      'node_modules/',
      'apps/**/node_modules/',
      'apps/backend/build/',
      'packages/types/dist/',
      '.pnpm',
      'apps/backend/analyses-storage/',
    ],
  },

  // Common base configuration for all JavaScript files
  {
    files: ['**/*.{js,jsx}'],
    languageOptions: {
      ecmaVersion: 2021,
      sourceType: 'module',
    },
    plugins: {
      prettier: prettierPlugin,
    },
    rules: {
      ...js.configs.recommended.rules,
      'no-unused-vars': ['error', { varsIgnorePattern: '^[A-Z_]' }],
      'no-var': 'error',
      'prefer-const': 'error',
      'prettier/prettier': 'error',
    },
  },

  // Common base configuration for all TypeScript files
  {
    files: ['**/*.{ts,tsx}'],
    languageOptions: {
      ecmaVersion: 2021,
      sourceType: 'module',
      parser: tsparser,
      parserOptions: {
        ecmaFeatures: { jsx: true },
      },
    },
    plugins: {
      '@typescript-eslint': tseslint,
      prettier: prettierPlugin,
    },
    rules: {
      ...js.configs.recommended.rules,
      ...tseslint.configs.recommended.rules,
      'no-unused-vars': 'off',
      '@typescript-eslint/no-unused-vars': [
        'error',
        { varsIgnorePattern: '^[A-Z_]', argsIgnorePattern: '^_' },
      ],
      'no-var': 'error',
      'prefer-const': 'error',
      'prettier/prettier': 'error',
    },
  },

  // Shared types package - needs both Node.js and browser globals
  {
    files: ['**/packages/types/**/*.ts'],
    languageOptions: {
      globals: {
        ...globals.node,
        ...globals.browser,
        NodeJS: 'readonly',
        // WebAuthn/Credentials API types
        PublicKeyCredential: 'readonly',
        PublicKeyCredentialCreationOptions: 'readonly',
        PublicKeyCredentialRequestOptions: 'readonly',
        AuthenticatorAttestationResponse: 'readonly',
        AuthenticatorAssertionResponse: 'readonly',
      },
      parser: tsparser,
      parserOptions: {
        ecmaVersion: 'latest',
        sourceType: 'module',
      },
    },
    plugins: {
      '@typescript-eslint': tseslint,
    },
    rules: {
      ...tseslint.configs.recommended.rules,
      'no-unused-vars': 'off',
      '@typescript-eslint/no-unused-vars': [
        'error',
        { varsIgnorePattern: '^[A-Z_]', argsIgnorePattern: '^_' },
      ],
      // Allow empty interfaces that extend other interfaces (useful for API types)
      '@typescript-eslint/no-empty-object-type': 'off',
    },
  },

  // Frontend React specific configuration (JavaScript)
  {
    files: ['**/frontend/**/*.{js,jsx}'],
    ignores: [
      // Allow global components to import raw Mantine components (they wrap them)
      '**/frontend/**/components/global/**/*.{js,jsx}',
    ],
    languageOptions: {
      globals: {
        ...globals.browser,
      },
      parserOptions: {
        ecmaVersion: 'latest',
        ecmaFeatures: { jsx: true },
        sourceType: 'module',
      },
    },
    plugins: {
      react: react,
      'react-hooks': reactHooks,
      'react-refresh': reactRefresh,
      'react-compiler': reactCompiler,
      'jsx-a11y': jsxA11y,
    },
    rules: {
      ...reactHooks.configs.recommended.rules,
      ...jsxA11y.flatConfigs.recommended.rules,
      'react-compiler/react-compiler': 'warn',
      'react-refresh/only-export-components': [
        'warn',
        { allowConstantExport: true },
      ],

      // Button component enforcement - prevent raw Mantine component usage
      'no-restricted-imports': [
        'error',
        {
          paths: [
            {
              name: '@mantine/core',
              importNames: ['Button'],
              message:
                'Do not import Button directly from @mantine/core. Use semantic button components instead: PrimaryButton, SecondaryButton, DangerButton, SuccessButton, UtilityButton, CancelButton, or FormActionButtons from "../global"',
            },
            {
              name: '@mantine/core',
              importNames: ['Alert'],
              message:
                'Do not import Alert directly from @mantine/core. Use FormAlert from "../global" for consistent alert styling.',
            },
          ],
        },
      ],

      // Prevent default imports from button components (enforce named imports only)
      'no-restricted-syntax': [
        'error',
        {
          selector:
            'ImportDeclaration[source.value*="/buttons/"] > ImportDefaultSpecifier',
          message:
            'Default imports from button components are not allowed. Use named imports instead: import { PrimaryButton } from "../global"',
        },
        {
          selector:
            'ImportDeclaration[source.value="../global"] > ImportDefaultSpecifier',
          message:
            'Default imports from global components are not allowed. Use named imports instead: import { PrimaryButton, FormAlert } from "../global"',
        },
      ],

      // Accessibility - ensure icon-only buttons have labels
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
    },
  },

  // Global components configuration - allow raw Mantine imports (JavaScript)
  {
    files: ['**/frontend/**/components/global/**/*.{js,jsx}'],
    languageOptions: {
      globals: {
        ...globals.browser,
      },
      parserOptions: {
        ecmaVersion: 'latest',
        ecmaFeatures: { jsx: true },
        sourceType: 'module',
      },
    },
    plugins: {
      react: react,
      'react-hooks': reactHooks,
      'react-refresh': reactRefresh,
      'react-compiler': reactCompiler,
      'jsx-a11y': jsxA11y,
    },
    rules: {
      ...reactHooks.configs.recommended.rules,
      ...jsxA11y.flatConfigs.recommended.rules,
      'react-compiler/react-compiler': 'warn',
      'react-refresh/only-export-components': [
        'warn',
        { allowConstantExport: true },
      ],
      // Explicitly allow Button and Alert imports in global components
      'no-restricted-imports': 'off',
    },
  },

  // Frontend React specific configuration (TypeScript)
  {
    files: ['**/frontend/**/*.{ts,tsx}'],
    ignores: [
      // Allow global components to import raw Mantine components (they wrap them)
      '**/frontend/**/components/global/**/*.{ts,tsx}',
    ],
    languageOptions: {
      globals: {
        ...globals.browser,
      },
      parser: tsparser,
      parserOptions: {
        ecmaVersion: 'latest',
        ecmaFeatures: { jsx: true },
        sourceType: 'module',
      },
    },
    plugins: {
      '@typescript-eslint': tseslint,
      react: react,
      'react-hooks': reactHooks,
      'react-refresh': reactRefresh,
      'react-compiler': reactCompiler,
      'jsx-a11y': jsxA11y,
    },
    rules: {
      ...reactHooks.configs.recommended.rules,
      ...jsxA11y.flatConfigs.recommended.rules,
      ...tseslint.configs.recommended.rules,
      'no-unused-vars': 'off',
      '@typescript-eslint/no-unused-vars': [
        'error',
        { varsIgnorePattern: '^[A-Z_]', argsIgnorePattern: '^_' },
      ],
      'react-compiler/react-compiler': 'warn',
      'react-refresh/only-export-components': [
        'warn',
        { allowConstantExport: true },
      ],

      // Button component enforcement - prevent raw Mantine component usage
      'no-restricted-imports': [
        'error',
        {
          paths: [
            {
              name: '@mantine/core',
              importNames: ['Button'],
              message:
                'Do not import Button directly from @mantine/core. Use semantic button components instead: PrimaryButton, SecondaryButton, DangerButton, SuccessButton, UtilityButton, CancelButton, or FormActionButtons from "../global"',
            },
            {
              name: '@mantine/core',
              importNames: ['Alert'],
              message:
                'Do not import Alert directly from @mantine/core. Use FormAlert from "../global" for consistent alert styling.',
            },
          ],
        },
      ],

      // Prevent default imports from button components (enforce named imports only)
      'no-restricted-syntax': [
        'error',
        {
          selector:
            'ImportDeclaration[source.value*="/buttons/"] > ImportDefaultSpecifier',
          message:
            'Default imports from button components are not allowed. Use named imports instead: import { PrimaryButton } from "../global"',
        },
        {
          selector:
            'ImportDeclaration[source.value="../global"] > ImportDefaultSpecifier',
          message:
            'Default imports from global components are not allowed. Use named imports instead: import { PrimaryButton, FormAlert } from "../global"',
        },
      ],

      // Accessibility - ensure icon-only buttons have labels
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
    },
  },

  // Global components configuration - allow raw Mantine imports (TypeScript)
  {
    files: ['**/frontend/**/components/global/**/*.{ts,tsx}'],
    languageOptions: {
      globals: {
        ...globals.browser,
      },
      parser: tsparser,
      parserOptions: {
        ecmaVersion: 'latest',
        ecmaFeatures: { jsx: true },
        sourceType: 'module',
      },
    },
    plugins: {
      '@typescript-eslint': tseslint,
      react: react,
      'react-hooks': reactHooks,
      'react-refresh': reactRefresh,
      'react-compiler': reactCompiler,
      'jsx-a11y': jsxA11y,
    },
    rules: {
      ...reactHooks.configs.recommended.rules,
      ...jsxA11y.flatConfigs.recommended.rules,
      ...tseslint.configs.recommended.rules,
      'no-unused-vars': 'off',
      '@typescript-eslint/no-unused-vars': [
        'error',
        { varsIgnorePattern: '^[A-Z_]', argsIgnorePattern: '^_' },
      ],
      'react-compiler/react-compiler': 'warn',
      'react-refresh/only-export-components': [
        'warn',
        { allowConstantExport: true },
      ],
      // Explicitly allow Button and Alert imports in global components
      'no-restricted-imports': 'off',
    },
  },

  // Backend Express/Node.js specific configuration (JavaScript)
  {
    files: ['**/backend/**/*.{js,mjs,cjs}'],
    languageOptions: {
      globals: {
        ...globals.node,
      },
    },
    plugins: {
      node: nodePlugin,
      security: securityPlugin,
    },
    rules: {
      // Error prevention for Node.js
      'no-return-await': 'error',
      'require-atomic-updates': 'error',

      // Security
      'security/detect-buffer-noassert': 'error',
      'security/detect-child-process': 'warn',
      'security/detect-eval-with-expression': 'error',
      'security/detect-no-csrf-before-method-override': 'error',
      'security/detect-non-literal-fs-filename': 'warn',
      'security/detect-non-literal-regexp': 'warn',
      'security/detect-non-literal-require': 'warn',
      'security/detect-possible-timing-attacks': 'warn',
      'security/detect-unsafe-regex': 'error',

      // Express/Node specific
      'node/exports-style': ['error', 'module.exports'],
      'node/file-extension-in-import': ['error', 'always'],
      'node/prefer-global/buffer': ['error', 'always'],
      'node/prefer-global/console': ['error', 'always'],
      'node/prefer-global/process': ['error', 'always'],
      'node/prefer-global/url-search-params': ['error', 'always'],
      'node/prefer-global/url': ['error', 'always'],
      'node/prefer-promises/dns': 'error',
      'node/prefer-promises/fs': 'error',
      'node/no-unpublished-require': 'off',
    },
  },

  // Backend Express/Node.js specific configuration (TypeScript)
  {
    files: ['**/backend/**/*.ts'],
    languageOptions: {
      globals: {
        ...globals.node,
        NodeJS: 'readonly',
        BufferEncoding: 'readonly',
      },
      parser: tsparser,
      parserOptions: {
        ecmaVersion: 'latest',
        sourceType: 'module',
      },
    },
    plugins: {
      '@typescript-eslint': tseslint,
      node: nodePlugin,
      security: securityPlugin,
    },
    rules: {
      ...tseslint.configs.recommended.rules,
      'no-unused-vars': 'off',
      '@typescript-eslint/no-unused-vars': [
        'error',
        { varsIgnorePattern: '^[A-Z_]', argsIgnorePattern: '^_' },
      ],
      // Disabled: TypeScript handles function overloading
      'no-redeclare': 'off',

      // Error prevention for Node.js
      'no-return-await': 'error',
      // Disabled: produces false positives for Express middleware patterns
      'require-atomic-updates': 'off',

      // Security
      'security/detect-buffer-noassert': 'error',
      'security/detect-child-process': 'warn',
      'security/detect-eval-with-expression': 'error',
      'security/detect-no-csrf-before-method-override': 'error',
      'security/detect-non-literal-fs-filename': 'warn',
      'security/detect-non-literal-regexp': 'warn',
      'security/detect-non-literal-require': 'warn',
      'security/detect-possible-timing-attacks': 'warn',
      'security/detect-unsafe-regex': 'error',

      // Node specific (subset applicable to TS)
      'node/prefer-global/buffer': ['error', 'always'],
      'node/prefer-global/console': ['error', 'always'],
      'node/prefer-global/process': ['error', 'always'],
      'node/prefer-global/url-search-params': ['error', 'always'],
      'node/prefer-global/url': ['error', 'always'],
      'node/prefer-promises/dns': 'error',
      'node/prefer-promises/fs': 'error',
    },
  },

  // YAML configuration for Docker files
  {
    files: ['*.{yaml}'],
    plugins: {
      yml: ymlPlugin,
    },
    languageOptions: {
      parser: ymlPlugin.parser,
    },
    rules: {
      'yml/quotes': ['error', { prefer: 'single', avoidEscape: true }],
      'yml/no-empty-document': 'error',
      'yml/no-empty-mapping-value': 'error',
      'yml/no-empty-sequence-entry': 'error',
      'yml/no-irregular-whitespace': 'error',
      'yml/plain-scalar': ['error', { forbidMultiline: true }],
      'yml/indent': ['error', 2],
      'yml/spaced-comment': ['error', 'always'],
    },
  },

  // Test files configuration - supports top-level await (JavaScript)
  {
    files: ['**/*.test.{js,jsx}', '**/tests/**/*.{js,jsx}'],
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: 'module',
      parserOptions: {
        ecmaVersion: 2022,
      },
    },
    rules: {
      'no-unused-vars': [
        'error',
        { varsIgnorePattern: '^_|^[A-Z_]', argsIgnorePattern: '^_' },
      ],
    },
  },

  // Test files configuration - supports top-level await (TypeScript)
  {
    files: ['**/*.test.{ts,tsx}', '**/tests/**/*.{ts,tsx}'],
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: 'module',
      parser: tsparser,
      parserOptions: {
        ecmaVersion: 2022,
        ecmaFeatures: { jsx: true },
      },
    },
    plugins: {
      '@typescript-eslint': tseslint,
    },
    rules: {
      'no-unused-vars': 'off',
      '@typescript-eslint/no-unused-vars': [
        'error',
        { varsIgnorePattern: '^_|^[A-Z_]', argsIgnorePattern: '^_' },
      ],
    },
  },

  // Must be last - disables conflicting ESLint rules
  prettierConfig,
];
