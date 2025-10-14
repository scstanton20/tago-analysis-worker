#!/usr/bin/env node
// utils/analysisWrapper.js
// Wrapper script that initializes DNS cache before running analysis

import path from 'path';
import { createChildLogger } from './logging/logger.js';
import './sharedDNSCache.js'; // This auto-initializes shared DNS cache if enabled

const logger = createChildLogger('analysis-wrapper');

// Get the analysis file path from command line arguments
const analysisFile = process.argv[2];

if (!analysisFile) {
  logger.error('Analysis file path not provided');
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
  logger.error({ err: error, path: fullPath }, 'Analysis failed to start');
  process.exit(1);
}
