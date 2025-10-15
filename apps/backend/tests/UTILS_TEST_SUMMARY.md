# Utility Module Test Suite Summary

This document summarizes the comprehensive test suites created for all backend utility modules.

## Test Files Created

### 1. analysisWrapper.test.js

**Source:** `/Users/sam/Documents/GitHub/tago-analysis-runner/apps/backend/src/utils/analysisWrapper.js`

**Test Coverage:**

- Command line argument parsing
- Missing argument error handling
- Path resolution for analysis files
- Dynamic import error handling
- Syntax error handling in analysis files
- Successful analysis import without errors
- Process exit code validation

**Key Test Areas:**

- Process.exit mocking and exit code capture
- Dynamic import mocking
- Logger error verification
- Path resolution correctness

---

### 2. asyncHandler.test.js

**Source:** `/Users/sam/Documents/GitHub/tago-analysis-runner/apps/backend/src/utils/asyncHandler.js`

**Test Coverage:**

- Successful async function execution
- Request, response, and next parameter passing
- Promise rejection catching and error forwarding
- Synchronous return value handling
- Error property preservation (statusCode, code, etc.)
- Multiple function signature support
- Null and string error handling

**Key Test Areas:**

- Promise.resolve wrapping
- Error catching and next() calling
- Edge case handling

---

### 3. authDatabase.test.js

**Source:** `/Users/sam/Documents/GitHub/tago-analysis-runner/apps/backend/src/utils/authDatabase.js`

**Test Coverage:**

- Database singleton pattern (getAuthDatabase)
- WAL mode enablement
- Process signal handlers (exit, SIGINT, SIGTERM)
- Database closure on process termination
- executeQuery - single row retrieval
- executeQueryAll - multiple row retrieval
- executeUpdate - INSERT/UPDATE/DELETE operations
- executeTransaction - transaction execution and rollback
- Error logging and handling

**Key Test Areas:**

- better-sqlite3 mocking
- Singleton instance verification
- Process event handler registration
- SQL statement preparation and execution
- Transaction function passing

---

### 4. logger.test.js

**Source:** `/Users/sam/Documents/GitHub/tago-analysis-runner/apps/backend/src/utils/logging/logger.js`

**Test Coverage:**

- createChildLogger with module name and context
- createAnalysisLogger with analysis-specific configuration
- parseLogLine for NDJSON format parsing
- Environment-based configuration (development vs production)
- Log level configuration (LOG_LEVEL env var)
- Grafana Loki transport configuration
- Loki labels parsing from environment
- Serializers (process, error, req, res)

**Key Test Areas:**

- Pino configuration
- Transport setup (pino-pretty, pino-loki, pino/file)
- NDJSON parsing and validation
- Serializer functionality
- Environment variable handling

---

### 5. metrics-enhanced.test.js

**Source:** `/Users/sam/Documents/GitHub/tago-analysis-runner/apps/backend/src/utils/metrics-enhanced.js`

**Test Coverage:**

- metricsMiddleware HTTP request tracking
- collectChildProcessMetrics for running/stopped processes
- Process resource metrics (CPU, memory, uptime)
- Tracking functions (restart, error, log line, IPC message, DNS cache)
- Process start time management
- Network stats collection (Linux-specific, gracefully skipped on other platforms)
- Process connection counting
- Prometheus metric exports

**Key Test Areas:**

- pidusage mocking
- Process metrics collection
- Platform-specific functionality (Linux /proc filesystem)
- Metric gauge/counter/histogram usage
- Error handling for missing processes

---

### 6. mqAPI.test.js

**Source:** `/Users/sam/Documents/GitHub/tago-analysis-runner/apps/backend/src/utils/mqAPI.js`

**Test Coverage:**

- getToken - OAuth authentication and Bearer token retrieval
- getAPIVersion - API version detection with fallback
- getAPICall - Generic GET request handling
- getDevices, getGateways, getAccount - Specific endpoint calls
- createDevice - POST request with default data merging
- Error handling and network failures
- Base64 credential encoding

**Key Test Areas:**

- Global fetch mocking
- OAuth flow (URLSearchParams, Basic auth)
- JSON response parsing
- Error response handling (JSON and non-JSON)
- Default export structure

---

### 7. responseHelpers.test.js

**Source:** `/Users/sam/Documents/GitHub/tago-analysis-runner/apps/backend/src/utils/responseHelpers.js`

**Test Coverage:**

- handleError status code mapping (400, 404, 409, 500)
- Error type detection (path traversal, not found, already exists, cannot move)
- Custom logger support
- Log suppression with logError option
- asyncHandler wrapper functionality
- Request logger preference (req.logger vs default)
- broadcastTeamStructureUpdate SSE broadcasting

**Key Test Areas:**

- Error message pattern matching
- HTTP status code correctness
- Logger integration
- Dynamic import mocking for services
- SSE manager interaction

---

### 8. sharedDNSCache.test.js

**Source:** `/Users/sam/Documents/GitHub/tago-analysis-runner/apps/backend/src/utils/sharedDNSCache.js`

**Test Coverage:**

- Initialization with DNS_CACHE_ENABLED flag
- DNS lookup interception via IPC
- DNS resolve4/resolve6 interception
- IPC message handling (lookup, resolve4, resolve6)
- Success and error response processing
- Timeout handling (10-second timeout)
- Auto-initialization on module import
- process.send availability checking

**Key Test Areas:**

- DNS module override
- IPC message flow
- Request ID tracking
- Pending request management
- Timer-based timeout testing
- Promise resolution/rejection

---

### 9. sse.test.js

**Source:** `/Users/sam/Documents/GitHub/tago-analysis-runner/apps/backend/src/utils/sse.js`

**Test Coverage:**

- SSEManager class initialization
- Client management (addClient, removeClient)
- Message sending (sendToUser, broadcast)
- SSE message formatting
- User disconnection (disconnectUser)
- Container state management (get, set, update)
- Heartbeat sending and lastHeartbeat updates
- Stale connection cleanup (60-second timeout)
- Better Auth session authentication
- SSE connection handling and header setup

**Key Test Areas:**

- Client registration and tracking
- Global vs user-specific client sets
- Response stream writing
- Connection lifecycle (connect, heartbeat, disconnect)
- Destroyed connection handling
- Interval management (heartbeat, metrics)
- Authentication middleware
- CORS header configuration

---

### 10. ssrfProtection.test.js

**Source:** `/Users/sam/Documents/GitHub/tago-analysis-runner/apps/backend/src/utils/ssrfProtection.js`

**Test Coverage:**

- validateHostname for public/private hostnames
- Localhost and metadata endpoint blocking
- IPv4 range validation (loopback, link-local, multicast, reserved)
- IPv6 address validation (loopback, link-local, multicast, IPv4-mapped)
- validateResolvedAddress for DNS responses
- validateResolvedAddresses for multiple addresses
- Address filtering with partial blocking
- getSSRFConfig configuration export
- Edge cases (empty strings, malformed IPs)

**Key Test Areas:**

- IP-to-integer conversion
- Range checking (start/end IP comparison)
- Pattern matching for IPv6
- Case-insensitive hostname matching
- Subdomain blocking
- Comprehensive IP range coverage

---

### 11. storage.test.js

**Source:** `/Users/sam/Documents/GitHub/tago-analysis-runner/apps/backend/src/utils/storage.js`

**Test Coverage:**

- initializeStorage directory creation
- Base storage directory setup
- All configured path directories creation
- Config file creation with version and timestamp
- Existing config file detection
- Recursive directory creation
- createDirs flag behavior
- Error handling (permissions, disk space, read-only filesystem)
- Parallel directory creation with Promise.all

**Key Test Areas:**

- safeMkdir and safeWriteFile mocking
- fs.access for file existence checking
- JSON config file formatting
- Error propagation and logging
- Config structure validation

---

## Test Execution

All tests use **vitest** as the testing framework and follow these patterns:

### Common Patterns:

- **Mocking:** Extensive use of `vi.mock()` for external dependencies
- **Module Isolation:** `vi.resetModules()` for fresh imports per test
- **Async Handling:** Proper `async/await` for promise-based code
- **Error Testing:** Both error throwing and error logging verification
- **Edge Cases:** Null, undefined, empty string, and malformed input testing

### Test Structure:

```javascript
describe('moduleName', () => {
  describe('functionName', () => {
    it('should do something specific', () => {
      // Arrange
      // Act
      // Assert
    });
  });
});
```

### Mocking Strategy:

- **File System:** `fs` and `fs.promises` mocked for safe testing
- **Logging:** Logger mocked to verify error/info calls
- **External APIs:** `fetch` mocked for network requests
- **Databases:** `better-sqlite3` mocked for database operations
- **Process:** `process.exit`, `process.send`, `process.on` mocked for lifecycle testing

## Running Tests

```bash
# Run all tests
npm test

# Run specific utility test
npm test -- tests/utils/asyncHandler.test.js

# Run with coverage
npm run test:coverage

# Run in watch mode
npm run test:watch
```

## Coverage Goals

Each test suite aims for:

- **Line Coverage:** >90%
- **Branch Coverage:** >85%
- **Function Coverage:** >95%
- **Statement Coverage:** >90%

## Test File Locations

All test files are located in:

```
/Users/sam/Documents/GitHub/tago-analysis-runner/apps/backend/tests/utils/
```

Corresponding to source files in:

```
/Users/sam/Documents/GitHub/tago-analysis-runner/apps/backend/src/utils/
```

## Existing Tests (Already Present)

1. **cryptoUtils.test.js** - Encryption/decryption testing
2. **safePath.test.js** - Path traversal protection testing

## Total Test Files: 13

- **New Test Files:** 11
- **Existing Test Files:** 2
- **Total Coverage:** All utility modules in src/utils/

---

**Generated:** 2025-01-15
**Framework:** Vitest
**Pattern:** Red-Green-Refactor (TDD)
**Test Style:** AAA (Arrange-Act-Assert)
