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
├── setup.ts                        # Global test setup
├── README.md                       # This file
├── utils/                          # Test utilities
│   └── testHelpers.ts             # Helper functions for tests
├── mocks/                          # Mock implementations
│   └── fsMocks.ts                 # File system mocks
├── controllers/                    # Controller tests
│   ├── analysisController.test.ts
│   ├── settingsController.test.ts
│   ├── statusController.test.ts
│   ├── teamController.test.ts
│   └── userController.test.ts
├── services/                       # Service tests
│   ├── analysisService.test.ts
│   ├── metricsService.test.ts
│   ├── teamService.test.ts
│   └── dnsCache.test.ts
├── models/                         # Model tests
│   └── analysisProcess.test.ts
├── utils/                          # Utility tests
│   ├── cryptoUtils.test.ts
│   ├── safePath.test.ts
│   ├── storage.test.ts
│   ├── sse.test.ts
│   ├── responseHelpers.test.ts
│   ├── asyncHandler.test.ts
│   ├── analysisWrapper.test.ts
│   ├── sharedDNSCache.test.ts
│   ├── ssrfProtection.test.ts
│   ├── mqAPI.test.ts
│   ├── logger.test.ts
│   ├── metrics-enhanced.test.ts
│   └── authDatabase.test.ts
├── middleware/                     # Middleware tests
│   ├── errorHandler.test.ts
│   ├── validateRequest.test.ts
│   ├── rateLimiter.test.ts
│   └── betterAuthMiddleware.test.ts
├── validation/                     # Validation tests
│   ├── analysisSchemas.test.ts
│   ├── settingsSchemas.test.ts
│   ├── teamSchemas.test.ts
│   └── userSchemas.test.ts
└── routes/                         # Route tests
    ├── analysisRoutes.test.ts
    ├── authRoutes.test.ts
    ├── metricsRoutes.test.ts
    ├── settingsRoutes.test.ts
    ├── sseRoutes.test.ts
    ├── statusRoutes.test.ts
    ├── teamRoutes.test.ts
    └── userRoutes.test.ts
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

Use the provided test helpers from `tests/utils/testHelpers.ts`:

```javascript
import {
  createMockRequest,
  createMockResponse,
  createMockNext,
  createMockFile,
  createMockSSEManager,
  createMockChildProcess,
  createMockAnalysisProcess,
} from '../utils/testHelpers.ts';

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

- `src/server.ts` (main entry point)
- `src/migrations/**`
- `src/docs/**`
- `src/config/**`
- `src/constants.ts`
- `src/lib/auth.ts`
- `src/routes/index.ts`

## Test Patterns and Examples

### Testing Controllers

```javascript
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createMockRequest, createMockResponse } from '../utils/testHelpers.ts';

// Mock dependencies
vi.mock('../../src/services/myService.ts', () => ({
  myService: {
    doSomething: vi.fn(),
  },
}));

const { myService } = await import('../../src/services/myService.ts');
const MyController = (await import('../../src/controllers/myController.ts'))
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
vi.mock('../../src/utils/safePath.ts', () => ({
  safeReadFile: vi.fn().mockResolvedValue('mock data'),
  safeWriteFile: vi.fn().mockResolvedValue(undefined),
}));

describe('MyService', () => {
  let myService;

  beforeEach(async () => {
    vi.clearAllMocks();
    const module = await import('../../src/services/myService.ts');
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
} from '../utils/testHelpers.ts';

describe('myMiddleware', () => {
  let middleware;
  let req, res, next;

  beforeEach(async () => {
    vi.clearAllMocks();
    const module = await import('../../src/middleware/myMiddleware.ts');
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
    const module = await import('../../src/validation/mySchemas.ts');
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

vi.mock('../../src/middleware/betterAuthMiddleware.ts', () => ({
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

    const routesModule = await import('../../src/routes/myRoutes.ts');
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

## Running Specific Tests

```bash
# Run specific test file
pnpm test tests/controllers/teamController.test.ts

# Run tests matching pattern
pnpm test team

# Run tests in specific directory
pnpm test tests/services

# Run tests with specific name
pnpm test -t "should create team"
```
