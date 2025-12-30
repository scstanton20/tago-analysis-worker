/**
 * Web Worker
 * Handles ESLint linting and Prettier formatting off the main thread
 *
 * @module workers/codeWorker
 */

import { Linter } from 'eslint-linter-browserify';
import * as prettier from 'prettier/standalone';

// ESLint configuration (imported inline to keep worker self-contained)
const eslintConfig = [
  {
    languageOptions: {
      ecmaVersion: 'latest',
      sourceType: 'module',
      globals: {
        console: 'readonly',
        setTimeout: 'readonly',
        clearTimeout: 'readonly',
        setInterval: 'readonly',
        clearInterval: 'readonly',
        Promise: 'readonly',
        Buffer: 'readonly',
        process: 'readonly',
        module: 'readonly',
        require: 'readonly',
        exports: 'readonly',
        __dirname: 'readonly',
        __filename: 'readonly',
        global: 'readonly',
        URL: 'readonly',
        URLSearchParams: 'readonly',
        fetch: 'readonly',
        Headers: 'readonly',
        Request: 'readonly',
        Response: 'readonly',
        TextEncoder: 'readonly',
        TextDecoder: 'readonly',
        AbortController: 'readonly',
        AbortSignal: 'readonly',
        Event: 'readonly',
        EventTarget: 'readonly',
        crypto: 'readonly',
        performance: 'readonly',
        queueMicrotask: 'readonly',
        structuredClone: 'readonly',
        atob: 'readonly',
        btoa: 'readonly',
      },
    },
    rules: {
      'no-unused-vars': 'warn',
      'no-undef': 'error',
      'no-const-assign': 'error',
      semi: ['warn', 'always'],
      'no-extra-semi': 'warn',
      'no-unreachable': 'error',
      'no-dupe-keys': 'error',
      'no-duplicate-case': 'error',
      'valid-typeof': 'error',
      'no-empty': 'warn',
      'no-ex-assign': 'error',
      'no-func-assign': 'error',
      'no-inner-declarations': 'error',
      'no-irregular-whitespace': 'warn',
      'no-sparse-arrays': 'warn',
      'no-unexpected-multiline': 'error',
      eqeqeq: ['warn', 'smart'],
      'no-eval': 'error',
      'no-implied-eval': 'error',
      'no-new-func': 'error',
      'no-new-wrappers': 'warn',
      'no-self-compare': 'error',
      'no-throw-literal': 'warn',
      'no-useless-concat': 'warn',
      'no-useless-escape': 'warn',
      'prefer-promise-reject-errors': 'warn',
      'no-shadow-restricted-names': 'error',
      'no-use-before-define': ['error', { functions: false, classes: true }],
    },
  },
];

// Prettier configuration
const prettierConfig = {
  parser: 'babel',
  semi: true,
  singleQuote: true,
  tabWidth: 2,
  trailingComma: 'all',
};

// Cached prettier plugins (loaded once)
let prettierPlugins = null;

// Initialize ESLint linter
const eslintLinter = new Linter({ configType: 'flat' });

/**
 * Load prettier plugins lazily
 */
async function loadPrettierPlugins() {
  if (prettierPlugins) return prettierPlugins;

  const [babel, estree] = await Promise.all([
    import('prettier/plugins/babel'),
    import('prettier/plugins/estree'),
  ]);

  prettierPlugins = [babel, estree];
  return prettierPlugins;
}

/**
 * Lint code using ESLint
 */
function lintCode(code) {
  try {
    const messages = eslintLinter.verify(code, eslintConfig);

    return {
      success: true,
      diagnostics: messages.map((message) => ({
        line: message.line,
        column: message.column,
        endLine: message.endLine,
        endColumn: message.endColumn,
        severity: message.severity === 2 ? 'error' : 'warning',
        message: message.message,
        source: 'eslint',
      })),
    };
  } catch (error) {
    return {
      success: false,
      error: error.message,
      diagnostics: [],
    };
  }
}

/**
 * Format code using Prettier
 */
async function formatCode(code) {
  try {
    const plugins = await loadPrettierPlugins();
    const formatted = await prettier.format(code, {
      ...prettierConfig,
      plugins,
    });

    return {
      success: true,
      formatted,
    };
  } catch (error) {
    return {
      success: false,
      error: error.message,
      formatted: code,
    };
  }
}

/**
 * Check if formatting would change the code
 */
async function checkFormatChanges(code) {
  try {
    const plugins = await loadPrettierPlugins();
    const formatted = await prettier.format(code, {
      ...prettierConfig,
      plugins,
    });

    return {
      success: true,
      hasChanges: formatted !== code,
    };
  } catch (error) {
    return {
      success: false,
      error: error.message,
      hasChanges: false,
    };
  }
}

// Message handler
self.onmessage = async (event) => {
  const { id, type, code } = event.data;

  let result;

  switch (type) {
    case 'lint':
      result = lintCode(code);
      break;

    case 'format':
      result = await formatCode(code);
      break;

    case 'checkFormat':
      result = await checkFormatChanges(code);
      break;

    default:
      result = { success: false, error: `Unknown operation: ${type}` };
  }

  self.postMessage({ id, ...result });
};

// Signal that worker is ready
self.postMessage({ type: 'ready' });
