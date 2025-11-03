import * as prettierPluginBabel from 'prettier/plugins/babel';
import * as prettierPluginEstree from 'prettier/plugins/estree';

/**
 * Shared Prettier configuration for code formatting
 * Used across CodeMirror editor and analysis saving
 */
export const PRETTIER_CONFIG = {
  parser: 'babel',
  plugins: [prettierPluginBabel, prettierPluginEstree],
  semi: true,
  singleQuote: true,
  tabWidth: 2,
  trailingComma: 'all',
};
