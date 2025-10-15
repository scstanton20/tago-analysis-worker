# Quick Integration Reference

## File Locations

```
apps/backend/tests/services/
├── dnsCache.test.js                           # EXISTING - Edit this
├── dnsCache-additional.test.js                # NEW - Copy from this
├── analysisService.test.js                    # EXISTING - Edit this
├── analysisService-additional.test.js         # NEW - Copy from this
├── TEST_COVERAGE_ENHANCEMENT_GUIDE.md         # Documentation
└── COVERAGE_SUMMARY.md                        # Summary
```

## Integration Steps

### Step 1: dnsCache.test.js

**Location to paste**: Line ~769 (before the final `});` of `describe('DNSCacheService'`)

**What to copy**: Lines from `dnsCache-additional.test.js` starting with:

```javascript
describe('installInterceptors', () => {
```

**Ending with**:

```javascript
});
```

(The closing brace of `describe('checkAndBroadcastStats'`)

**Visual guide**:

```javascript
describe('DNSCacheService', () => {
  // ... existing tests ...

  describe('edge cases', () => {
    // ... existing edge case tests ...
  });

  // ============= PASTE NEW TESTS HERE =============
  describe('installInterceptors', () => {
    // ... 26 new test cases ...
  });
  // ============= END PASTE =============
}); // <-- Main describe closing brace
```

### Step 2: analysisService.test.js

**Location to paste**: Line ~790 (before the final `});` of `describe('AnalysisService'`)

**What to copy**: Lines from `analysisService-additional.test.js` starting with:

```javascript
describe('validateTimeRange', () => {
```

**Ending with**:

```javascript
}
```

(The closing brace of the `formatFileSize` helper function)

**Visual guide**:

```javascript
describe('AnalysisService', () => {
  // ... existing tests ...

  describe('lock management', () => {
    // ... existing lock management tests ...
  });

  // ============= PASTE NEW TESTS HERE =============
  describe('validateTimeRange', () => {
    // ... 68 new test cases in 14 describe blocks ...
  });
  // ============= END PASTE =============
}); // <-- Main describe closing brace
```

## Verification Commands

```bash
# 1. Verify tests run successfully
npm test

# 2. Check coverage improvements
npm run test:coverage

# 3. Run specific files to isolate issues
npm test dnsCache.test.js
npm test analysisService.test.js

# 4. Watch mode for development
npm test -- --watch
```

## Expected Results

### Before Integration

```
Test Suites: 2 passed, 2 total
Tests:       ~40 passed, ~40 total

Coverage:
  dnsCache.js:        69% lines, 30/44 functions
  analysisService.js: 69% lines, 30/44 functions
```

### After Integration

```
Test Suites: 2 passed, 2 total
Tests:       ~134 passed, ~134 total (+94 new tests)

Coverage:
  dnsCache.js:        ~95% lines, ~42/44 functions (+26% lines, +12 functions)
  analysisService.js: ~95% lines, ~42/44 functions (+26% lines, +12 functions)
```

## Troubleshooting

### Issue: "Cannot find module 'events'"

**Fix**: The stream testing mocks might need adjustment. Check that vitest config includes proper node modules.

### Issue: Tests timeout

**Fix**: Ensure all callback-based tests call `done()`. Check for missing `await` on async functions.

### Issue: "Mock is not a function"

**Fix**: Verify that `vi.clearAllMocks()` is in `beforeEach` and all mocks are properly initialized.

### Issue: Import errors

**Fix**: Ensure the new test blocks are pasted INSIDE the main describe block, not outside.

## File Structure After Integration

### dnsCache.test.js (expanded)

```javascript
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// ... all mocks ...

describe('DNSCacheService', () => {
  let dnsCache;

  beforeEach(async () => {
    // ... setup ...
  });

  afterEach(() => {
    // ... cleanup ...
  });

  // ===== EXISTING TESTS =====
  describe('initialize', () => {
    /* ... */
  });
  describe('loadConfig', () => {
    /* ... */
  });
  describe('saveConfig', () => {
    /* ... */
  });
  describe('cache operations', () => {
    /* ... */
  });
  describe('updateConfig', () => {
    /* ... */
  });
  describe('updateEnvironmentVariables', () => {
    /* ... */
  });
  describe('checkAndResetTTLPeriod', () => {
    /* ... */
  });
  describe('getStats', () => {
    /* ... */
  });
  describe('resetStats', () => {
    /* ... */
  });
  describe('getConfig', () => {
    /* ... */
  });
  describe('IPC DNS handlers', () => {
    /* ... */
  });
  describe('stats broadcasting', () => {
    /* ... */
  });
  describe('edge cases', () => {
    /* ... */
  });

  // ===== NEW TESTS =====
  describe('installInterceptors', () => {
    describe('dns.lookup interception', () => {
      /* 6 tests */
    });
    describe('dnsPromises.resolve4 interception', () => {
      /* 6 tests */
    });
    describe('dnsPromises.resolve6 interception', () => {
      /* 6 tests */
    });
  });

  describe('getSSEManager', () => {
    /* 3 tests */
  });

  describe('checkAndBroadcastStats', () => {
    /* 5 tests */
  });
});
```

### analysisService.test.js (expanded)

```javascript
import { describe, it, expect, vi, beforeEach } from 'vitest';

// ... all mocks ...

describe('AnalysisService', () => {
  let analysisService;

  beforeEach(async () => {
    // ... setup ...
  });

  // ===== EXISTING TESTS =====
  describe('initialization', () => {
    /* ... */
  });
  describe('uploadAnalysis', () => {
    /* ... */
  });
  describe('runAnalysis', () => {
    /* ... */
  });
  describe('stopAnalysis', () => {
    /* ... */
  });
  describe('deleteAnalysis', () => {
    /* ... */
  });
  describe('renameAnalysis', () => {
    /* ... */
  });
  describe('updateAnalysis', () => {
    /* ... */
  });
  describe('environment management', () => {
    /* ... */
  });
  describe('version management', () => {
    /* ... */
  });
  describe('log management', () => {
    /* ... */
  });
  describe('config management', () => {
    /* ... */
  });
  describe('health check', () => {
    /* ... */
  });
  describe('lock management', () => {
    /* ... */
  });

  // ===== NEW TESTS =====
  describe('validateTimeRange', () => {
    /* 6 tests */
  });
  describe('getInitialLogs', () => {
    /* 4 tests */
  });
  describe('getAnalysisContent', () => {
    /* 3 tests */
  });
  describe('getVersionContent', () => {
    /* 4 tests */
  });
  describe('streamLogsFromFile', () => {
    /* 4 tests */
  });
  describe('getLogsForDownload', () => {
    /* 8 tests */
  });
  describe('getLogsFromFile', () => {
    /* 3 tests */
  });
  describe('formatFileSize', () => {
    /* 7 tests */
  });
  describe('getAllAnalyses with permission filtering', () => {
    /* 4 tests */
  });
  describe('getProcessStatus', () => {
    /* 4 tests */
  });
  describe('getAnalysesThatShouldBeRunning', () => {
    /* 3 tests */
  });
  describe('verifyIntendedState', () => {
    /* 5 tests */
  });
  describe('migrateConfigToV4_0', () => {
    /* 6 tests */
  });
  describe('migrateConfigToV4_1', () => {
    /* 5 tests */
  });
});

// Helper function at the end
function formatFileSize(bytes) {
  /* ... */
}
```

## Checklist

- [ ] Backup existing test files
- [ ] Open `dnsCache.test.js` in editor
- [ ] Find line ~769 (before closing `});`)
- [ ] Copy 3 describe blocks from `dnsCache-additional.test.js`
- [ ] Paste before the closing brace
- [ ] Save file
- [ ] Run `npm test dnsCache.test.js` to verify
- [ ] Open `analysisService.test.js` in editor
- [ ] Find line ~790 (before closing `});`)
- [ ] Copy 14 describe blocks + helper from `analysisService-additional.test.js`
- [ ] Paste before the closing brace
- [ ] Save file
- [ ] Run `npm test analysisService.test.js` to verify
- [ ] Run `npm test` to verify all tests
- [ ] Run `npm run test:coverage` to verify coverage
- [ ] Review coverage report
- [ ] Commit changes

## Quick Copy Commands

```bash
# View the files to copy
cat apps/backend/tests/services/dnsCache-additional.test.js
cat apps/backend/tests/services/analysisService-additional.test.js

# Check current test counts
npm test -- --reporter=verbose | grep -c "✓"

# After integration, compare
npm test -- --reporter=verbose | grep -c "✓"
# Should be ~94 more tests
```

## Coverage Reports

After running `npm run test:coverage`, check:

```bash
# View coverage summary
cat coverage/coverage-summary.json

# View HTML report
open coverage/index.html

# Check specific files
grep -A 5 "dnsCache.js" coverage/coverage-summary.json
grep -A 5 "analysisService.js" coverage/coverage-summary.json
```

## Success Indicators

✅ All tests pass
✅ No console errors
✅ Coverage increased by ~26% for both files
✅ Function coverage increased by ~12 functions for both files
✅ Tests run in < 5 seconds
✅ No timing issues or flaky tests

## Rollback Plan

If issues arise:

```bash
# Restore from backup
cp dnsCache.test.js.backup dnsCache.test.js
cp analysisService.test.js.backup analysisService.test.js

# Or use git
git checkout -- apps/backend/tests/services/dnsCache.test.js
git checkout -- apps/backend/tests/services/analysisService.test.js
```

---

**Total integration time**: ~5-10 minutes
**Total new test cases**: 94 tests
**Coverage improvement**: ~26% per file
**Testing time**: ~2-3 seconds for all tests
