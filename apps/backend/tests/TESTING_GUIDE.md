# Backend Testing Guide

**Last Updated**: 2025-10-18
**Status**: Active - Follow these patterns for all new tests

## Overview

This guide documents the **correct way** to write backend tests that actually verify security and functionality. Tests should use **real authentication** and catch real bugs, not just verify that mocked functions were called.

## Table of Contents

1. [Principles](#principles)
2. [Test Infrastructure](#test-infrastructure)
3. [Writing Integration Tests](#writing-integration-tests)
4. [Common Patterns](#common-patterns)
5. [Examples](#examples)
6. [Migration Guide](#migration-guide)

---

## Principles

### ✅ DO

- **Use real better-auth sessions** with actual database users
- **Test multiple user roles** (admin, owner, editor, viewer, no-access)
- **Include negative tests** (401, 403 responses)
- **Test permission boundaries** (who can and can't do what)
- **Verify cross-team isolation** (users can't access other teams)
- **Mock external services only** (file system, external APIs, SSE)

### ❌ DON'T

- **Mock authentication middleware** - This creates false positives
- **Mock authorization checks** - These are what you're trying to test
- **Use fake users** - Use real database users created by better-auth
- **Skip negative tests** - Always test rejection scenarios
- **Test only happy paths** - Test edge cases and security boundaries

---

## Test Infrastructure

### Test Users

We provide 8 test users with different permission levels:

```javascript
import { TEST_USERS } from '../fixtures/testUsers.js';

// Available test users:
TEST_USERS.admin; // Global admin, all permissions
TEST_USERS.noAccess; // User with no team memberships
TEST_USERS.teamOwner; // Full permissions on team-1
TEST_USERS.teamEditor; // Edit permissions on team-1
TEST_USERS.teamViewer; // Read-only on team-1
TEST_USERS.teamRunner; // View + run on team-1
TEST_USERS.multiTeamUser; // Access to team-1 and team-2
TEST_USERS.team2User; // Access only to team-2
```

### Auth Helpers

```javascript
import {
  setupTestAuth,
  cleanupTestAuth,
  createTestSession,
  getSessionCookie,
} from '../utils/authHelpers.js';
```

| Function                     | Purpose                                                   |
| ---------------------------- | --------------------------------------------------------- |
| `setupTestAuth()`            | Call in `beforeAll` - creates test organization and teams |
| `cleanupTestAuth()`          | Call in `afterAll` - removes all test data                |
| `createTestSession(userKey)` | Creates a real session for a test user                    |
| `getSessionCookie(userKey)`  | Returns cookie string for supertest requests              |

---

## Writing Integration Tests

### Basic Template

```javascript
import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import express from 'express';
import request from 'supertest';
import {
  setupTestAuth,
  cleanupTestAuth,
  getSessionCookie,
} from '../utils/authHelpers.js';

describe('My Route Integration Tests', () => {
  let app;

  beforeAll(async () => {
    await setupTestAuth(); // Create test users/teams
  });

  afterAll(async () => {
    await cleanupTestAuth(); // Cleanup test data
  });

  beforeEach(async () => {
    // Create fresh Express app with REAL middleware
    app = express();
    app.use(express.json());

    // Import REAL middleware (no mocks!)
    const { attachRequestLogger } = await import(
      '../../src/middleware/loggingMiddleware.js'
    );
    app.use(attachRequestLogger);

    // Import routes
    const { default: myRoutes } = await import('../../src/routes/myRoutes.js');
    app.use('/api/my-route', myRoutes);
  });

  it('should reject unauthenticated requests', async () => {
    await request(app).get('/api/my-route').expect(401);
  });

  it('should allow authenticated admin', async () => {
    const cookie = await getSessionCookie('admin');

    await request(app).get('/api/my-route').set('Cookie', cookie).expect(200);
  });
});
```

### Testing Permission Boundaries

```javascript
describe('Permission Boundaries', () => {
  it('should allow users with permission', async () => {
    const editorCookie = await getSessionCookie('teamEditor');

    await request(app)
      .put('/api/analyses/test-analysis')
      .set('Cookie', editorCookie)
      .send({ content: 'updated' })
      .expect(200);
  });

  it('should deny users without permission', async () => {
    const viewerCookie = await getSessionCookie('teamViewer');

    await request(app)
      .put('/api/analyses/test-analysis')
      .set('Cookie', viewerCookie)
      .send({ content: 'hacked' })
      .expect(403);
  });
});
```

### Testing Cross-Team Isolation

```javascript
describe('Cross-Team Isolation', () => {
  beforeEach(() => {
    // Mock service to return analyses from different teams
    mockAnalysisService.getAllAnalyses.mockResolvedValue({
      'team1-analysis.js': { teamId: 'team-1' },
      'team2-analysis.js': { teamId: 'team-2' },
    });
  });

  it('should allow access to own team', async () => {
    const team1Cookie = await getSessionCookie('teamEditor');

    await request(app)
      .get('/api/analyses/team1-analysis/content')
      .set('Cookie', team1Cookie)
      .expect(200);
  });

  it('should deny access to other team', async () => {
    const team2Cookie = await getSessionCookie('team2User');

    await request(app)
      .get('/api/analyses/team1-analysis/content')
      .set('Cookie', team2Cookie)
      .expect(403);
  });
});
```

---

## Common Patterns

### Pattern 1: Test All Permission Levels

For each protected endpoint, test:

1. ✅ **Admin** - should have access
2. ✅ **User with permission** - should have access
3. ❌ **User without permission** - should be denied (403)
4. ❌ **Unauthenticated** - should be denied (401)
5. ❌ **User from different team** - should be denied (403)

```javascript
describe('DELETE /api/analyses/:fileName', () => {
  const tests = [
    { user: 'admin', expectedStatus: 200, description: 'admin' },
    { user: 'teamOwner', expectedStatus: 200, description: 'owner' },
    { user: 'teamEditor', expectedStatus: 403, description: 'editor' },
    { user: 'teamViewer', expectedStatus: 403, description: 'viewer' },
    { user: 'noAccess', expectedStatus: 403, description: 'no access' },
    { user: 'team2User', expectedStatus: 403, description: 'other team' },
  ];

  for (const { user, expectedStatus, description } of tests) {
    it(`should ${expectedStatus === 200 ? 'allow' : 'deny'} ${description}`, async () => {
      const cookie = await getSessionCookie(user);

      await request(app)
        .delete('/api/analyses/test-analysis')
        .set('Cookie', cookie)
        .expect(expectedStatus);
    });
  }

  it('should deny unauthenticated', async () => {
    await request(app).delete('/api/analyses/test-analysis').expect(401);
  });
});
```

### Pattern 2: Test Data Isolation

```javascript
it('should not leak data between teams', async () => {
  const team1Cookie = await getSessionCookie('teamEditor');
  const team2Cookie = await getSessionCookie('team2User');

  mockAnalysisService.getAllAnalyses.mockResolvedValue({
    'team1-analysis.js': {
      teamId: 'team-1',
      config: { secret: 'team1-secret' },
    },
    'team2-analysis.js': {
      teamId: 'team-2',
      config: { secret: 'team2-secret' },
    },
  });

  // Team 1 user can only see team 1 data
  const team1Response = await request(app)
    .get('/api/analyses')
    .set('Cookie', team1Cookie)
    .expect(200);

  expect(team1Response.body.analyses).toHaveProperty('team1-analysis.js');
  expect(team1Response.body.analyses).not.toHaveProperty('team2-analysis.js');

  // Team 2 user can only see team 2 data
  const team2Response = await request(app)
    .get('/api/analyses')
    .set('Cookie', team2Cookie)
    .expect(200);

  expect(team2Response.body.analyses).toHaveProperty('team2-analysis.js');
  expect(team2Response.body.analyses).not.toHaveProperty('team1-analysis.js');
});
```

### Pattern 3: What to Mock

```javascript
// ✅ Mock external services
vi.mock('../../src/utils/storage.js');
vi.mock('fs/promises');
vi.mock('child_process');

// ✅ Mock SSE (external communication)
vi.mock('../../src/utils/sse.js', () => ({
  broadcastUpdate: vi.fn(),
}));

// ✅ Mock service layer (if testing routes, not services)
vi.mock('../../src/services/analysisService.js', () => ({
  analysisService: {
    getAllAnalyses: vi.fn(),
    // ...
  },
}));

// ❌ DON'T mock authentication
// vi.mock('../../src/middleware/betterAuthMiddleware.js'); // NEVER!

// ❌ DON'T mock authorization
// vi.mock('../../src/middleware/rateLimiter.js'); // NEVER!
```

---

## Examples

### Example 1: Complete Route Test

See: `apps/backend/tests/routes/analysisRoutes.REFACTORED.test.js`

This file shows the complete pattern for testing a route with:

- Authentication tests
- Permission boundary tests
- Cross-team isolation tests
- Multi-team user scenarios
- Admin bypass tests
- Edge cases and security tests

### Example 2: Service Test (Unit Test)

Service tests CAN use mocks because they're testing business logic, not integration:

```javascript
import { describe, it, expect, vi } from 'vitest';
import { myService } from '../../src/services/myService.js';

// Mock database
vi.mock('../../src/utils/authDatabase.js', () => ({
  executeQuery: vi.fn(),
}));

describe('MyService (Unit Tests)', () => {
  it('should process data correctly', () => {
    const result = myService.processData({ foo: 'bar' });
    expect(result).toEqual({ foo: 'BAR' });
  });
});
```

### Example 3: Middleware Test (Unit Test)

Middleware tests in isolation are fine with mocks:

```javascript
import { describe, it, expect, vi } from 'vitest';
import { myMiddleware } from '../../src/middleware/myMiddleware.js';
import {
  createMockRequest,
  createMockResponse,
  createMockNext,
} from '../utils/testHelpers.js';

describe('MyMiddleware (Unit Tests)', () => {
  it('should call next when valid', () => {
    const req = createMockRequest();
    const res = createMockResponse();
    const next = createMockNext();

    myMiddleware(req, res, next);

    expect(next).toHaveBeenCalled();
  });
});
```

---

## Migration Guide

### Migrating Existing Tests

1. **Identify the test type**
   - Route test → Integration test (remove auth mocks)
   - Service test → Unit test (keep mocks)
   - Middleware test → Unit test (keep mocks)

2. **For route tests:**

   **Before (Bad)**:

   ```javascript
   vi.mock('../../src/middleware/betterAuthMiddleware.js', () => ({
     authMiddleware: (req, res, next) => {
       req.user = { id: 'test', role: 'admin' };
       next();
     },
   }));

   it('should require auth', async () => {
     await request(app).get('/api/test');
     expect(controller.test).toHaveBeenCalled();
   });
   ```

   **After (Good)**:

   ```javascript
   // No auth mocks!

   it('should reject unauthenticated', async () => {
     await request(app).get('/api/test').expect(401);
   });

   it('should allow authenticated admin', async () => {
     const cookie = await getSessionCookie('admin');
     await request(app).get('/api/test').set('Cookie', cookie).expect(200);
   });
   ```

3. **Add test setup/teardown:**

   ```javascript
   beforeAll(async () => {
     await setupTestAuth();
   });

   afterAll(async () => {
     await cleanupTestAuth();
   });
   ```

4. **Add permission boundary tests:**

   For each protected operation, add tests for:
   - Users with permission (should succeed)
   - Users without permission (should fail with 403)
   - Unauthenticated users (should fail with 401)
   - Cross-team users (should fail with 403)

---

## Checklist for New Tests

When writing a new test file, ensure:

- [ ] Uses real better-auth sessions (no auth mocks)
- [ ] Tests multiple user roles
- [ ] Includes negative test cases (401, 403)
- [ ] Tests permission boundaries
- [ ] Verifies cross-team isolation (if applicable)
- [ ] Calls `setupTestAuth()` in `beforeAll`
- [ ] Calls `cleanupTestAuth()` in `afterAll`
- [ ] Only mocks external services and file system
- [ ] Uses real middleware chain
- [ ] Tests would FAIL if security was broken

---

## Running Tests

```bash
# Run all tests
pnpm --filter backend test

# Run specific test file
pnpm --filter backend vitest run tests/routes/analysisRoutes.test.js

# Run tests in watch mode
pnpm --filter backend vitest watch

# Run tests with coverage
pnpm --filter backend vitest run --coverage
```

---

## Troubleshooting

### "No such table: user"

**Problem**: Test database not initialized
**Solution**: Ensure `setupTestAuth()` is called in `beforeAll`

### "Unauthorized" even with valid cookie

**Problem**: Session not created properly
**Solution**: Check that `createTestSession()` is awaited

### Tests pass but code is broken

**Problem**: Too much mocking
**Solution**: Remove auth/authz mocks, use real middleware

### Database locked errors

**Problem**: Parallel test execution with SQLite
**Solution**: Use `--no-threads` flag or sequential test execution

---

## Resources

- **Test Fixtures**: `apps/backend/tests/fixtures/testUsers.js`
- **Auth Helpers**: `apps/backend/tests/utils/authHelpers.js`
- **Example Test**: `apps/backend/tests/routes/analysisRoutes.REFACTORED.test.js`
- **Audit Report**: `/TEST_AUDIT_REPORT.md`

---

## Questions?

If you're unsure about how to write a test:

1. Check the example in `analysisRoutes.REFACTORED.test.js`
2. Look at the test fixtures in `tests/fixtures/testUsers.js`
3. Review the patterns in this guide
4. Ask the team!

---

**Remember**: Tests are only valuable if they catch real bugs. Mocking authentication creates a false sense of security. Always use real auth sessions in integration tests!
