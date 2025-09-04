#!/usr/bin/env node
// utils/analysisWrapper.js
// Wrapper script that initializes DNS cache before running analysis

import path from 'path';
import './sharedDNSCache.js'; // This auto-initializes shared DNS cache if enabled

// Get the analysis file path from command line arguments
const analysisFile = process.argv[2];

if (!analysisFile) {
  console.error('[WRAPPER] Error: Analysis file path not provided');
  process.exit(1);
}

// Resolve the full path to the analysis file
const fullPath = path.resolve(analysisFile);

try {
  // Import and run the analysis - this sets up listeners and keeps process alive
  import(fullPath);

  // Don't log "completed" here - the analysis stays running
  // Only log completion if the process actually exits
} catch (error) {
  console.error(`[WRAPPER] Analysis failed to start: ${fullPath}`, error);
  process.exit(1);
}
