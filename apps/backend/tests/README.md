# Backend Test Suite

Comprehensive test suite for the Tago Analysis Runner backend application using Vitest.

## Table of Contents

- [Overview](#overview)
- [Setup](#setup)
- [Running Tests](#running-tests)
- [Test Structure](#test-structure)
- [Writing Tests](#writing-tests)
- [Coverage Goals](#coverage-goals)
- [Completed Tests](#completed-tests)
- [Remaining Tests to Implement](#remaining-tests-to-implement)
- [Test Patterns and Examples](#test-patterns-and-examples)
- [Best Practices](#best-practices)

## Overview

This test suite provides comprehensive coverage for the backend application, including:

- **Controllers**: HTTP request handlers
- **Services**: Business logic layer
- **Models**: Data models and process management
- **Utilities**: Helper functions and shared utilities
- **Middleware**: Express middleware functions
- **Validation**: Zod schema validations
- **Routes**: API endpoint definitions

**Target Coverage**: >80% for lines, functions, branches, and statements

## Setup

The test suite is already configured with:

- **Vitest**: Fast unit test framework
- **Vitest UI**: Interactive test UI
- **Coverage (v8)**: Code coverage reporting
- **Supertest**: HTTP assertion library for route testing

All dependencies are installed. No additional setup required.

## Running Tests

```bash
# Run all tests in watch mode
pnpm test

# Run tests once (CI mode)
pnpm test:run

# Run tests with UI
pnpm test:ui

# Run tests with coverage
pnpm test:coverage

# Run tests with coverage and UI
pnpm test:coverage:ui
```

## Test Structure

```
tests/
├── setup.js                        # Global test setup
├── README.md                       # This file
├── utils/                          # Test utilities
│   └── testHelpers.js             # Helper functions for tests
├── mocks/                          # Mock implementations
│   └── fsMocks.js                 # File system mocks
├── controllers/                    # Controller tests
│   ├── analysisController.test.js # ✅ COMPLETED
│   ├── settingsController.test.js # TODO
│   ├── statusController.test.js   # TODO
│   ├── teamController.test.js     # TODO
│   └── userController.test.js     # TODO
├── services/                       # Service tests
│   ├── analysisService.test.js    # ✅ COMPLETED
│   ├── metricsService.test.js     # TODO
│   ├── teamService.test.js        # TODO
│   └── dnsCache.test.js           # TODO
├── models/                         # Model tests
│   └── analysisProcess.test.js    # ✅ COMPLETED
├── utils/                          # Utility tests
│   ├── cryptoUtils.test.js        # ✅ COMPLETED
│   ├── safePath.test.js           # ✅ COMPLETED
│   ├── storage.test.js            # TODO
│   ├── sse.test.js                # TODO
│   ├── responseHelpers.test.js    # TODO
│   ├── asyncHandler.test.js       # TODO
│   ├── analysisWrapper.test.js    # TODO
│   ├── sharedDNSCache.test.js     # TODO
│   ├── ssrfProtection.test.js     # TODO
│   ├── mqAPI.test.js              # TODO
│   ├── logger.test.js             # TODO
│   ├── metrics-enhanced.test.js   # TODO
│   └── authDatabase.test.js       # TODO
├── middleware/                     # Middleware tests
│   ├── errorHandler.test.js       # ✅ COMPLETED
│   ├── validateRequest.test.js    # TODO
│   ├── rateLimiter.test.js        # TODO
│   └── betterAuthMiddleware.test.js # TODO
├── validation/                     # Validation tests
│   ├── analysisSchemas.test.js    # ✅ COMPLETED
│   ├── settingsSchemas.test.js    # TODO
│   ├── teamSchemas.test.js        # TODO
│   └── userSchemas.test.js        # TODO
└── routes/                         # Route tests
    ├── analysisRoutes.test.js     # TODO
    ├── authRoutes.test.js         # TODO
    ├── metricsRoutes.test.js      # TODO
    ├── settingsRoutes.test.js     # TODO
    ├── sseRoutes.test.js          # TODO
    ├── statusRoutes.test.js       # ✅ COMPLETED
    ├── teamRoutes.test.js         # TODO
    └── userRoutes.test.js         # TODO
```

## Writing Tests

### General Test Structure

```javascript
import { describe, it, expect, vi, beforeEach } from 'vitest';

describe('ModuleName', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('functionName', () => {
    it('should do something successfully', () => {
      // Arrange
      const input = 'test';

      // Act
      const result = functionName(input);

      // Assert
      expect(result).toBe('expected');
    });

    it('should handle errors', () => {
      expect(() => functionName(null)).toThrow('Error message');
    });

    it('should handle edge cases', () => {
      expect(functionName('')).toBe('');
    });
  });
});
```

### Test Helpers

Use the provided test helpers from `tests/utils/testHelpers.js`:

```javascript
import {
  createMockRequest,
  createMockResponse,
  createMockNext,
  createMockFile,
  createMockSSEManager,
  createMockChildProcess,
  createMockAnalysisProcess,
} from '../utils/testHelpers.js';

// Create mock objects
const req = createMockRequest({ params: { id: '123' } });
const res = createMockResponse();
const next = createMockNext();
```

## Coverage Goals

- **Lines**: >80%
- **Functions**: >80%
- **Branches**: >80%
- **Statements**: >80%

Excluded from coverage:

- `src/server.js` (main entry point)
- `src/migrations/**`
- `src/docs/**`
- `src/config/**`
- `src/constants.js`
- `src/lib/auth.js`

## Completed Tests

The following test files are complete and can serve as templates:

1. **analysisController.test.js** - Full controller test with all endpoints
2. **analysisService.test.js** - Comprehensive service test with business logic
3. **analysisProcess.test.js** - Complete model test with lifecycle management
4. **cryptoUtils.test.js** - Utility test for encryption/decryption
5. **safePath.test.js** - Security-focused utility test
6. **errorHandler.test.js** - Middleware test example
7. **analysisSchemas.test.js** - Validation schema test
8. **statusRoutes.test.js** - Route test with supertest

## Remaining Tests to Implement

### High Priority

#### Controllers

- **settingsController.test.js** - Settings management endpoints
- **teamController.test.js** - Team/department management
- **userController.test.js** - User management
- **statusController.test.js** - Status and health checks

#### Services

- **teamService.test.js** - Team business logic
- **metricsService.test.js** - Metrics collection
- **dnsCache.test.js** - DNS caching service

### Medium Priority

#### Middleware

- **validateRequest.test.js** - Request validation middleware
- **rateLimiter.test.js** - Rate limiting middleware
- **betterAuthMiddleware.test.js** - Authentication middleware

#### Validation

- **settingsSchemas.test.js** - Settings validation schemas
- **teamSchemas.test.js** - Team validation schemas
- **userSchemas.test.js** - User validation schemas

#### Routes

- **analysisRoutes.test.js** - Analysis API routes
- **teamRoutes.test.js** - Team API routes
- **authRoutes.test.js** - Authentication routes
- **metricsRoutes.test.js** - Metrics routes
- **sseRoutes.test.js** - SSE routes

### Lower Priority

#### Utilities

- **storage.test.js** - Storage initialization
- **sse.test.js** - Server-Sent Events manager
- **responseHelpers.test.js** - HTTP response helpers
- **asyncHandler.test.js** - Async error handling
- **analysisWrapper.test.js** - Analysis process wrapper
- **sharedDNSCache.test.js** - Shared DNS cache
- **ssrfProtection.test.js** - SSRF protection
- **mqAPI.test.js** - Message queue API
- **logger.test.js** - Logging utilities
- **metrics-enhanced.test.js** - Enhanced metrics
- **authDatabase.test.js** - Auth database utilities

## Test Patterns and Examples

### Testing Controllers

```javascript
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createMockRequest, createMockResponse } from '../utils/testHelpers.js';

// Mock dependencies
vi.mock('../../src/services/myService.js', () => ({
  myService: {
    doSomething: vi.fn(),
  },
}));

const { myService } = await import('../../src/services/myService.js');
const MyController = (await import('../../src/controllers/myController.js'))
  .default;

describe('MyController', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('endpoint', () => {
    it('should handle request successfully', async () => {
      const req = createMockRequest({ body: { data: 'test' } });
      const res = createMockResponse();

      myService.doSomething.mockResolvedValue({ result: 'success' });

      await MyController.endpoint(req, res);

      expect(myService.doSomething).toHaveBeenCalledWith('test');
      expect(res.json).toHaveBeenCalledWith({ result: 'success' });
    });

    it('should handle errors', async () => {
      const req = createMockRequest({ body: { data: 'test' } });
      const res = createMockResponse();

      myService.doSomething.mockRejectedValue(new Error('Failed'));

      await MyController.endpoint(req, res);

      expect(res.status).toHaveBeenCalledWith(500);
    });
  });
});
```

### Testing Services

```javascript
import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock dependencies
vi.mock('../../src/utils/safePath.js', () => ({
  safeReadFile: vi.fn().mockResolvedValue('mock data'),
  safeWriteFile: vi.fn().mockResolvedValue(undefined),
}));

describe('MyService', () => {
  let myService;

  beforeEach(async () => {
    vi.clearAllMocks();
    const module = await import('../../src/services/myService.js');
    myService = module.myService;
  });

  describe('method', () => {
    it('should perform business logic', async () => {
      const result = await myService.method('input');

      expect(result).toEqual({ success: true });
    });

    it('should handle errors gracefully', async () => {
      await expect(myService.method(null)).rejects.toThrow('Invalid input');
    });
  });
});
```

### Testing Middleware

```javascript
import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  createMockRequest,
  createMockResponse,
  createMockNext,
} from '../utils/testHelpers.js';

describe('myMiddleware', () => {
  let middleware;
  let req, res, next;

  beforeEach(async () => {
    vi.clearAllMocks();
    const module = await import('../../src/middleware/myMiddleware.js');
    middleware = module.default;

    req = createMockRequest();
    res = createMockResponse();
    next = createMockNext();
  });

  it('should call next on success', () => {
    middleware(req, res, next);

    expect(next).toHaveBeenCalled();
  });

  it('should handle errors', () => {
    req.headers = { invalid: 'header' };

    middleware(req, res, next);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(next).not.toHaveBeenCalled();
  });
});
```

### Testing Validation Schemas

```javascript
import { describe, it, expect, beforeEach } from 'vitest';

describe('mySchemas', () => {
  let schemas;

  beforeEach(async () => {
    const module = await import('../../src/validation/mySchemas.js');
    schemas = module;
  });

  describe('mySchema', () => {
    it('should validate valid data', () => {
      const validData = { field: 'value' };

      const result = schemas.mySchema.safeParse(validData);

      expect(result.success).toBe(true);
    });

    it('should reject invalid data', () => {
      const invalidData = { field: 123 };

      const result = schemas.mySchema.safeParse(invalidData);

      expect(result.success).toBe(false);
      expect(result.error?.issues[0].path).toContain('field');
    });
  });
});
```

### Testing Routes with Supertest

```javascript
import { describe, it, expect, vi, beforeEach } from 'vitest';
import express from 'express';
import request from 'supertest';

vi.mock('../../src/middleware/betterAuthMiddleware.js', () => ({
  requireAuth: (req, res, next) => {
    req.user = { id: 'test-user', role: 'admin' };
    next();
  },
}));

describe('My Routes', () => {
  let app;

  beforeEach(async () => {
    vi.clearAllMocks();

    app = express();
    app.use(express.json());

    const routesModule = await import('../../src/routes/myRoutes.js');
    app.use('/api/my-endpoint', routesModule.default);
  });

  describe('GET /api/my-endpoint', () => {
    it('should return data', async () => {
      const response = await request(app).get('/api/my-endpoint').expect(200);

      expect(response.body).toEqual(
        expect.objectContaining({
          data: expect.any(Array),
        }),
      );
    });
  });

  describe('POST /api/my-endpoint', () => {
    it('should create resource', async () => {
      const response = await request(app)
        .post('/api/my-endpoint')
        .send({ name: 'Test' })
        .expect(201);

      expect(response.body).toEqual(
        expect.objectContaining({
          id: expect.any(String),
          name: 'Test',
        }),
      );
    });

    it('should validate input', async () => {
      await request(app)
        .post('/api/my-endpoint')
        .send({ invalid: 'data' })
        .expect(400);
    });
  });
});
```

## Best Practices

### 1. Test Organization

- Use descriptive `describe` blocks for grouping related tests
- Name test cases clearly with `it('should ...')`
- Follow Arrange-Act-Assert pattern
- Keep tests focused and isolated

### 2. Mocking

- Mock external dependencies at the top of the file
- Use `vi.clearAllMocks()` in `beforeEach` to reset mocks
- Mock only what's necessary
- Verify mock calls with `expect().toHaveBeenCalledWith()`

### 3. Test Coverage

- Test happy paths (successful operations)
- Test error scenarios (failures, invalid input)
- Test edge cases (empty arrays, null values, boundary conditions)
- Test security concerns (path traversal, injection attacks)

### 4. Assertions

- Use specific matchers (`toBe`, `toEqual`, `toContain`)
- Test both return values and side effects
- Verify error messages and status codes
- Check that mocks are called with correct arguments

### 5. Async Testing

- Always `await` async functions in tests
- Use `async/await` syntax consistently
- Handle promise rejections with `expect().rejects.toThrow()`
- Test race conditions and concurrent operations

### 6. Test Data

- Use realistic test data
- Create helper functions for common test data
- Avoid hardcoding magic numbers
- Use constants for repeated values

### 7. Performance

- Keep tests fast (mock slow operations)
- Avoid unnecessary database calls
- Use parallel test execution (default in Vitest)
- Profile slow tests with `test:ui`

### 8. Maintenance

- Update tests when code changes
- Remove obsolete tests
- Refactor duplicated test code
- Document complex test scenarios

## Tips for Quick Implementation

1. **Start with happy paths** - Get basic functionality working first
2. **Copy and adapt** - Use completed tests as templates
3. **Run tests frequently** - Use watch mode during development
4. **Focus on coverage gaps** - Check coverage report to find untested code
5. **Test incrementally** - Complete one file at a time
6. **Use test:ui** - Visual interface helps understand test flow
7. **Mock liberally** - Don't hesitate to mock complex dependencies
8. **Ask for help** - Review completed tests for patterns

## Running Specific Tests

```bash
# Run specific test file
pnpm test tests/controllers/teamController.test.js

# Run tests matching pattern
pnpm test team

# Run tests in specific directory
pnpm test tests/services

# Run tests with specific name
pnpm test -t "should create team"
```

## Debugging Tests

1. **Use `console.log`** - Temporarily add logs to understand test flow
2. **Use `test.only`** - Run single test in isolation
3. **Use `test.skip`** - Skip failing tests temporarily
4. **Check mock calls** - Verify mocks are called as expected
5. **Use Vitest UI** - Visual debugging interface
6. **Check coverage** - Identify untested code paths

## Next Steps

1. Choose a test file from the TODO list
2. Copy a similar completed test as a template
3. Read the source file to understand functionality
4. Write tests for all public methods/endpoints
5. Run tests and verify coverage
6. Commit completed test file
7. Move to next file

## Questions or Issues?

- Review completed test files for patterns
- Check Vitest documentation: https://vitest.dev
- Check this README for examples
- Run `pnpm test:ui` for visual test interface

Good luck with implementing the remaining tests!
