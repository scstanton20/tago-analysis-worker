import { createContext, useContext } from 'react';

/**
 * Factory function to create SSE context and hook with error handling
 * @param {string} name - The context name (e.g., 'Analyses', 'Teams', 'Backend', 'Connection')
 * @returns {Object} { Context, useContextHook }
 */
export function createSSEContext(name) {
  const Context = createContext(null);

  function useContextHook() {
    const context = useContext(Context);
    if (!context) {
      throw new Error(`use${name} must be used within SSE${name}Provider`);
    }
    return context;
  }

  // Set display name for React DevTools
  Context.displayName = `SSE${name}Context`;

  return { Context, useContextHook };
}
