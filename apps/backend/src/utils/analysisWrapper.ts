#!/usr/bin/env node
/**
 * Wrapper script that initializes DNS cache before running analysis
 *
 * Note: Uses sandboxLogger since this runs in sandboxed child process.
 * All output goes to stdout/stderr which parent captures and routes
 * through its pino pipeline (SSE, file, Loki).
 *
 * Console methods are patched to use colored output with the analysis name.
 */

import path from 'path';
import { createLogger } from './logging/sandboxLogger.ts';
import './sharedDNSCache.ts'; // This auto-initializes shared DNS cache if enabled

const wrapperLogger = createLogger('analysis-wrapper');

// Get the analysis file path from command line arguments
const analysisFile = process.argv[2];

if (!analysisFile) {
  wrapperLogger.error('Analysis file path not provided');
  process.exit(1);
}

// Extract analysis name from path (parent folder name)
// e.g., /path/to/analyses/my-analysis/index.js -> my-analysis
const analysisName = path.basename(path.dirname(analysisFile));

// Create analysis-specific logger
const analysisLogger = createLogger(analysisName);

/**
 * Patch console methods to use colored sandboxLogger
 *
 * This allows user code and the TagoIO SDK to use standard console methods
 * while getting colored, formatted output with the analysis name prefix.
 */
function patchConsole(): void {
  // Save original trace for stack trace output
  const originalTrace = console.trace.bind(console);

  // Helper to format arguments into a single message
  const formatArgs = (...args: unknown[]): string => {
    return args
      .map((arg) =>
        typeof arg === 'object' ? JSON.stringify(arg) : String(arg),
      )
      .join(' ');
  };

  // Patch each console method
  console.log = (...args: unknown[]) => {
    analysisLogger.info(formatArgs(...args));
  };

  console.info = (...args: unknown[]) => {
    analysisLogger.info(formatArgs(...args));
  };

  console.warn = (...args: unknown[]) => {
    analysisLogger.warn(formatArgs(...args));
  };

  console.error = (...args: unknown[]) => {
    analysisLogger.error(formatArgs(...args));
  };

  console.debug = (...args: unknown[]) => {
    analysisLogger.debug(formatArgs(...args));
  };

  console.trace = (...args: unknown[]) => {
    analysisLogger.trace(formatArgs(...args));
    // Also print stack trace using original
    originalTrace();
  };
}

// Patch console before loading the analysis
patchConsole();

// Resolve the full path to the analysis file
const fullPath = path.resolve(analysisFile);

try {
  // Import and run the analysis - this sets up listeners and keeps process alive
  import(fullPath);

  // Don't log "completed" here - the analysis stays running
  // Only log completion if the process actually exits
} catch (error) {
  wrapperLogger.error(
    { err: error, path: fullPath },
    'Analysis failed to start',
  );
  process.exit(1);
}
