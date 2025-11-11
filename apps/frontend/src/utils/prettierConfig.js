/**
 * Shared Prettier configuration for code formatting
 * Used across CodeMirror editor and analysis saving
 *
 * Note: Plugins are loaded dynamically on first use to avoid bundling
 * them until the editor is actually opened.
 */

let cachedPlugins = null;

/**
 * Get Prettier plugins, loading them on first call and caching
 * @returns {Promise<Array>} Array of prettier plugins
 */
async function getPrettierPlugins() {
  if (cachedPlugins) {
    return cachedPlugins;
  }

  // Lazy load prettier plugins only when needed
  const [prettierPluginBabel, prettierPluginEstree] = await Promise.all([
    import('prettier/plugins/babel'),
    import('prettier/plugins/estree'),
  ]);

  cachedPlugins = [prettierPluginBabel, prettierPluginEstree];
  return cachedPlugins;
}

/**
 * Get complete Prettier configuration with loaded plugins
 * Lazily loads prettier plugins on first call and caches them
 * @returns {Promise<Object>} Prettier configuration object
 */
export async function getPrettierConfig() {
  const plugins = await getPrettierPlugins();
  return {
    parser: 'babel',
    plugins,
    semi: true,
    singleQuote: true,
    tabWidth: 2,
    trailingComma: 'all',
  };
}
