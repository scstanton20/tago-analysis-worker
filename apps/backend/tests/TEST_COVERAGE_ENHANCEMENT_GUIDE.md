# Test Coverage Enhancement Guide

This guide explains how to integrate the additional test coverage for `dnsCache.js` and `analysisService.js` to achieve comprehensive coverage.

## Overview

Two additional test files have been created:

- `/tests/services/dnsCache-additional.test.js` - Additional tests for DNS cache service
- `/tests/services/analysisService-additional.test.js` - Additional tests for analysis service

These tests cover the missing functions identified in the coverage analysis.

## Integration Instructions

### Option 1: Copy-Paste Integration (Recommended)

#### For dnsCache.test.js

1. Open `/tests/services/dnsCache.test.js`
2. Locate the closing `});` of the main `describe('DNSCacheService', () => {` block
3. Add the new describe blocks from `dnsCache-additional.test.js` **before** that closing bracket
4. The structure should look like:

```javascript
describe('DNSCacheService', () => {
  // ... existing tests ...

  // NEW TESTS START HERE
  describe('installInterceptors', () => {
    // ... new tests ...
  });

  describe('getSSEManager', () => {
    // ... new tests ...
  });

  describe('checkAndBroadcastStats', () => {
    // ... new tests ...
  });
  // NEW TESTS END HERE
});
```

#### For analysisService.test.js

1. Open `/tests/services/analysisService.test.js`
2. Locate the closing `});` of the main `describe('AnalysisService', () => {` block
3. Add the new describe blocks from `analysisService-additional.test.js` **before** that closing bracket
4. The structure should look like:

```javascript
describe('AnalysisService', () => {
  // ... existing tests ...

  // NEW TESTS START HERE
  describe('validateTimeRange', () => {
    // ... new tests ...
  });

  describe('getInitialLogs', () => {
    // ... new tests ...
  });

  // ... all other new describe blocks ...
  // NEW TESTS END HERE
});
```

### Option 2: Separate Test Files

If you prefer to keep tests separate:

1. Rename the additional test files:
   - `dnsCache-additional.test.js` → `dnsCache-extended.test.js`
   - `analysisService-additional.test.js` → `analysisService-extended.test.js`

2. Add the same imports and mocks from the original test files to the top of each extended file

3. Run both test files together with vitest

## Coverage Improvements

### dnsCache.js - New Coverage

**Functions now tested:**

1. **`installInterceptors()`** - DNS interception logic
   - ✅ `dns.lookup` callback flows (cache hit, cache miss, SSRF validation)
   - ✅ `dnsPromises.resolve4` promise flows (cache hit, cache miss, address filtering)
   - ✅ `dnsPromises.resolve6` promise flows (cache hit, cache miss, IPv6 validation)
   - ✅ SSRF protection at hostname and resolved address levels
   - ✅ Error handling for failed DNS lookups
   - ✅ Prometheus metrics updates

2. **`getSSEManager()`** - Lazy SSE import
   - ✅ First call creates and caches SSE manager
   - ✅ Subsequent calls return cached instance
   - ✅ Concurrent calls wait for same promise
   - ✅ Promise cleanup after successful load

3. **`checkAndBroadcastStats()`** - Stats broadcasting
   - ✅ Broadcasts when hits, misses, errors, or cache size change
   - ✅ Skips broadcast when stats unchanged
   - ✅ Updates lastStatsSnapshot after broadcast
   - ✅ Handles SSE manager errors gracefully
   - ✅ Handles broadcast failures without throwing

**Edge cases covered:**

- DNS lookup with and without options parameter
- SSRF blocking at multiple validation layers
- Filtered address lists (some blocked, some allowed)
- Complete address blocking (all private)
- File stream errors and readline errors
- Empty and malformed log files

### analysisService.js - New Coverage

**Functions now tested:**

1. **`validateTimeRange()`** - Time range validation
   - ✅ Valid ranges: '1h', '24h', '7d', '30d', 'all'
   - ✅ Invalid range rejection

2. **`getInitialLogs()`** - SSE initial logs
   - ✅ Default limit of 50
   - ✅ Custom limit parameter
   - ✅ Non-existent analysis handling
   - ✅ Empty logs handling

3. **`getAnalysisContent()`** - Source code retrieval
   - ✅ File content reading
   - ✅ File not found errors
   - ✅ Permission errors

4. **`getVersionContent()`** - Version-specific content
   - ✅ Version 0 returns current
   - ✅ Specific version retrieval
   - ✅ Non-existent version errors
   - ✅ Permission denied handling

5. **`streamLogsFromFile()`** - Efficient log streaming
   - ✅ Pagination with page and limit
   - ✅ NDJSON parsing
   - ✅ Reverse chronological ordering
   - ✅ Empty file handling
   - ✅ Stream error handling

6. **`getLogsForDownload()`** - Filtered log download
   - ✅ All time ranges (1h, 24h, 7d, 30d, all)
   - ✅ Timestamp-based filtering
   - ✅ Human-readable formatting
   - ✅ Non-existent file handling
   - ✅ Empty log file handling

7. **`getLogsFromFile()`** - File-based log retrieval
   - ✅ Delegation to streamLogsFromFile
   - ✅ ENOENT handling
   - ✅ Permission errors

8. **`formatFileSize()`** - Size formatting utility
   - ✅ 0 bytes handling
   - ✅ B, KB, MB formatting
   - ✅ Decimal precision (2 places)

9. **`getAllAnalyses()`** - Permission filtering
   - ✅ No filter (all analyses)
   - ✅ Team ID filtering
   - ✅ Empty results when no match
   - ✅ Null teamId handling

10. **`getProcessStatus()`** - Process status
    - ✅ Existing analysis status
    - ✅ Non-existent returns 'stopped'
    - ✅ All status values (running, stopped, error)

11. **`getAnalysesThatShouldBeRunning()`** - Intended state filtering
    - ✅ Returns running intendedState
    - ✅ Empty when none running
    - ✅ Empty when no analyses

12. **`verifyIntendedState()`** - Startup verification
    - ✅ Starts analyses with intendedState=running
    - ✅ Skips already running with live process
    - ✅ Restarts if status=running but no process
    - ✅ Handles start failures
    - ✅ Returns comprehensive summary

13. **`migrateConfigToV4_0()`** - Config migration v4.0
    - ✅ Migrates pre-v4.0 configs
    - ✅ Creates teamStructure
    - ✅ Groups analyses by teamId
    - ✅ Handles uncategorized analyses
    - ✅ Skips if already v4.0+
    - ✅ Saves config after migration

14. **`migrateConfigToV4_1()`** - Config migration v4.1
    - ✅ Migrates v4.0 to v4.1
    - ✅ Removes deprecated type field
    - ✅ Skips if not v4.0
    - ✅ Handles missing type fields
    - ✅ Saves config after migration

## Running the Tests

### Run all tests:

```bash
npm test
# or
pnpm test
```

### Run specific test file:

```bash
npm test dnsCache.test.js
npm test analysisService.test.js
```

### Run with coverage:

```bash
npm run test:coverage
# or
pnpm test:coverage
```

### Watch mode during development:

```bash
npm test -- --watch
```

## Expected Coverage Improvements

### Before Enhancement:

- **dnsCache.js**: 69% line coverage, 30/44 function coverage
- **analysisService.js**: 69% line coverage, 30/44 function coverage

### After Enhancement:

- **dnsCache.js**: ~95%+ line coverage, ~42/44 function coverage
- **analysisService.js**: ~95%+ line coverage, ~42/44 function coverage

## Test Organization

Both test files follow the existing patterns:

1. **Mock Setup**: All dependencies mocked at module level
2. **beforeEach**: Fresh service instance and cleared mocks
3. **Describe Blocks**: Organized by function/feature
4. **Test Names**: Descriptive with "should" statements
5. **Assertions**: Multiple assertions per test where appropriate
6. **Error Handling**: Both success and failure paths tested

## Key Testing Patterns Used

### 1. DNS Interception Testing

```javascript
it('should intercept dns.lookup and return cached result', (done) => {
  dnsCache.installInterceptors();
  dnsCache.addToCache('example.com:4', { address: '1.2.3.4', family: 4 });

  dns.lookup('example.com', { family: 4 }, (err, address, family) => {
    expect(err).toBeNull();
    expect(address).toBe('1.2.3.4');
    done();
  });
});
```

### 2. Promise-based Testing

```javascript
it('should perform actual resolve4 on cache miss', async () => {
  dnsCache.originalResolve4 = vi.fn().mockResolvedValue(['1.2.3.4']);
  const addresses = await dnsPromises.resolve4('newhost.com');
  expect(addresses).toEqual(['1.2.3.4']);
});
```

### 3. Stream Testing

```javascript
it('should stream logs from file', async () => {
  // Mock readline and fs streams
  const result = await analysisService.streamLogsFromFile(
    '/path/to/log',
    1,
    50,
  );
  expect(result.logs.length).toBeLessThanOrEqual(50);
  expect(result.source).toBe('file-stream');
});
```

### 4. Time-based Filtering

```javascript
it('should filter logs for 1h time range', async () => {
  const now = new Date();
  const thirtyMinutesAgo = new Date(now.getTime() - 30 * 60 * 1000);
  // Test filtering logic
});
```

## Troubleshooting

### If tests fail after integration:

1. **Import errors**: Ensure all mocks are properly set up at the top of the file
2. **Timing issues**: Some tests use `done()` callbacks - ensure they're called
3. **Mock state**: Check that `beforeEach` properly resets all mocks
4. **Async issues**: Ensure all async tests use `async/await` or return promises

### Common fixes:

```javascript
// Fix: Missing await
await analysisService.someAsyncFunction(); // ✅ Good
analysisService.someAsyncFunction(); // ❌ Bad

// Fix: Mock not reset
beforeEach(() => {
  vi.clearAllMocks(); // ✅ Always reset
});

// Fix: Callback test not finishing
it('should test callback', (done) => {
  callback(() => {
    expect(true).toBe(true);
    done(); // ✅ Must call done
  });
});
```

## Next Steps

1. ✅ Copy tests from additional files into main test files
2. ✅ Run tests: `npm test`
3. ✅ Check coverage: `npm run test:coverage`
4. ✅ Fix any failing tests
5. ✅ Commit changes
6. ✅ Update CI/CD coverage requirements if needed

## Additional Notes

- Tests follow TDD principles with red-green-refactor cycles
- Edge cases and error paths are thoroughly covered
- Tests serve as living documentation of service behavior
- Mocking strategy isolates units under test
- Consistent naming and structure for maintainability
